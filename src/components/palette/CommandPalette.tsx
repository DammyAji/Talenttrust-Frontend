'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CommandItem,
  staticCommands,
  parseDynamicCommands,
  rankCommands,
  getRecentCommands,
  saveRecentCommand,
} from '@/lib/commands';
import { site, apiDocsUrl } from '@/lib/site';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [recent, setRecent] = useState<CommandItem[]>([]);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  // Load recent commands
  useEffect(() => {
    if (isOpen) {
      setRecent(getRecentCommands());
    }
  }, [isOpen]);

  // Compute filtered commands
  const dynamic = parseDynamicCommands(query);
  const pool = query.trim() ? [...dynamic, ...staticCommands] : recent.length > 0 ? [...recent, ...staticCommands] : staticCommands;
  // Deduplicate by id
  const uniquePool = pool.filter((item, index, self) => index === self.findIndex((i) => i.id === item.id));
  const filtered = rankCommands(query, uniquePool);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closePalette = useCallback(() => {
    // Cancel a pending input focus so it cannot steal focus back after closing.
    if (focusTimer.current !== null) {
      clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }
    setIsOpen(false);
    const dialog = dialogRef.current;
    if (dialog && dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
    }
    // Restore focus
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
    }
  }, []);

  const openPalette = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    setIsOpen(true);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }
    if (focusTimer.current !== null) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      focusTimer.current = null;
      inputRef.current?.focus();
    }, 50);
  }, []);

  // Handle global shortcuts: Ctrl+K / Cmd+K and Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        closePalette();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        const target = e.target as HTMLElement | null;
        const isInputField =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.isContentEditable;

        // If typing in another input (and not already inside the palette), ignore
        if (isInputField && !dialogRef.current?.contains(target)) {
          return;
        }

        e.preventDefault();
        if (isOpen) {
          closePalette();
        } else {
          triggerRef.current = target;
          openPalette();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closePalette, openPalette]);

  const executeCommand = (cmd: CommandItem) => {
    saveRecentCommand(cmd);
    closePalette();

    if (cmd.href) {
      router.push(cmd.href);
      return;
    }

    if (cmd.actionType === 'copy-contract') {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(site.contractId).catch(() => {});
      }
      setAnnouncement(`Copied contract ID: ${site.contractId}`);
      return;
    }

    if (cmd.actionType === 'open-docs') {
      window.open(apiDocsUrl, '_blank');
      setAnnouncement('Opening API documentation');
      return;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
        break;
      case 'Home':
        e.preventDefault();
        setSelectedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setSelectedIndex(filtered.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closePalette();
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (listboxRef.current) {
      const activeElement = listboxRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const activeOptionId = filtered[selectedIndex] ? `cmd-option-${filtered[selectedIndex].id}` : undefined;

  return (
    <>
      <button
        type="button"
        className="palette-trigger-btn"
        onClick={(e) => {
          triggerRef.current = e.currentTarget;
          openPalette();
        }}
        aria-label="Search and command palette (Press Ctrl+K or Cmd+K to open)"
      >
        <span className="palette-search-icon" aria-hidden="true">🔍</span>
        <span className="palette-trigger-text">Search…</span>
        <kbd className="palette-kbd">⌘K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="palette-dialog"
        onCancel={(e) => {
          e.preventDefault();
          closePalette();
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            closePalette();
          }
        }}
      >
        <div className="palette-modal-content">
          <div className="palette-input-wrap">
            <span className="palette-input-icon" aria-hidden="true">🔍</span>
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-controls="command-listbox"
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              className="palette-input"
              placeholder="Type a command, route, #escrow or Stellar address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className="palette-close-btn"
              onClick={closePalette}
              aria-label="Close command palette"
            >
              ESC
            </button>
          </div>

          <ul
            id="command-listbox"
            ref={listboxRef}
            role="listbox"
            aria-label="Suggestions"
            className="palette-listbox"
          >
            {filtered.length === 0 ? (
              <li className="palette-empty" role="presentation">
                No matching commands found.
              </li>
            ) : (
              filtered.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const optionId = `cmd-option-${item.id}`;
                return (
                  <li
                    key={item.id}
                    id={optionId}
                    role="option"
                    aria-selected={isSelected}
                    className={`palette-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => executeCommand(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="palette-option-main">
                      <span className="palette-option-title">{item.title}</span>
                      {item.subtitle && <span className="palette-option-subtitle">{item.subtitle}</span>}
                    </div>
                    <span className="palette-option-badge">{item.category}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </dialog>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
