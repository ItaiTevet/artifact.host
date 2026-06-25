'use client';

import type { KeyboardEvent, ComponentProps } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import tokens from './syntax.module.css';
import styles from './html-editor.module.css';

const highlight = (code: string) => Prism.highlight(code, Prism.languages.markup, 'markup');

/** Live, syntax-highlighted HTML editor. A real <textarea> sits transparently over a
 * highlighted <pre> (react-simple-code-editor), so paste/typing/caret all work normally
 * while the HTML shows colored. `variant` picks the surface + token palette. */
export function HtmlEditor({
  value, onValueChange, placeholder, id, onKeyDown, variant = 'light', minHeight,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  variant?: 'light' | 'dark';
  minHeight?: number;
}) {
  const dark = variant === 'dark';
  return (
    <Editor
      value={value}
      onValueChange={onValueChange}
      highlight={highlight}
      placeholder={placeholder}
      onKeyDown={onKeyDown as ComponentProps<typeof Editor>['onKeyDown']}
      textareaId={id}
      padding={dark ? 16 : 15}
      textareaClassName={styles.textarea}
      className={`${styles.editor} ${dark ? styles.dark : styles.light} ${dark ? tokens.dark : tokens.light}`}
      style={{ minHeight: minHeight ?? (dark ? 320 : 140) }}
    />
  );
}
