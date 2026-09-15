import { Fragment } from "react";

/**
 * Renders the small markdown subset used in notices and the Terms & Conditions:
 * blank-line paragraphs and **bold** runs.
 *
 * Built out of React elements rather than injected HTML — notice bodies are
 * admin-authored, but they still never get a path to `dangerouslySetInnerHTML`.
 */
export function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{renderInline(paragraph)}</p>
      ))}
    </div>
  );
}

function renderInline(paragraph: string) {
  // Split on **bold** while keeping the delimiters' contents.
  const segments = paragraph.split(/(\*\*[^*]+\*\*)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return <strong key={index}>{segment.slice(2, -2)}</strong>;
    }
    // Preserve single newlines inside a paragraph as line breaks.
    const lines = segment.split("\n");
    return (
      <Fragment key={index}>
        {lines.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}
