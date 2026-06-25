import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import styles from './syntax.module.css';

type Lang = 'bash' | 'json';

/** Static, syntax-highlighted code block for the docs. Highlighting runs at render
 * time via Prism (works on the server); colors come from the shared dark palette. */
export function CodeBlock({ code, lang }: { code: string; lang: Lang }) {
  const grammar = Prism.languages[lang] ?? Prism.languages.markup;
  const html = Prism.highlight(code, grammar, lang);
  return (
    <pre className={`${styles.block} ${styles.dark}`}>
      <code className={`language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
