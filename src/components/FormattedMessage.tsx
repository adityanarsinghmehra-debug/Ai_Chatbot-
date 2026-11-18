import React from 'react';
import { parseInlineFormatting } from '../utils/backup';

interface FormattedMessageProps {
  content: string;
  isUser?: boolean;
}

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content, isUser = false }) => {
  const lines = content.split('\n');

  const renderSpans = (line: string, keyPrefix: string) => {
    const spans = parseInlineFormatting(line);
    return spans.map((span, idx) => {
      if (span.type === 'bold') {
        return (
          <strong key={`${keyPrefix}-${idx}`} className="font-semibold">
            {span.value}
          </strong>
        );
      }
      if (span.type === 'code') {
        return (
          <code
            key={`${keyPrefix}-${idx}`}
            className={`font-mono text-[0.9em] px-1.5 py-0.5 rounded-md ${
              isUser
                ? 'bg-white/20 text-white dark:bg-black/15 dark:text-[#062E6F]'
                : 'bg-[#EEF2F7] text-[#0F172A] dark:bg-[#232B38] dark:text-[#E2E8F0]'
            }`}
          >
            {span.value}
          </code>
        );
      }
      return <React.Fragment key={`${keyPrefix}-${idx}`}>{span.value}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2 text-[15px] sm:text-base leading-relaxed break-words">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" aria-hidden="true" />;
        }
        if (/^[-*]\s+/.test(trimmed)) {
          const itemText = trimmed.replace(/^[-*]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span
                aria-hidden="true"
                className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${
                  isUser ? 'bg-white/80 dark:bg-[#062E6F]/80' : 'bg-[#0B57D0] dark:bg-[#A8C7FA]'
                }`}
              />
              <span>{renderSpans(itemText, `li-${idx}`)}</span>
            </div>
          );
        }
        return <p key={idx}>{renderSpans(line, `p-${idx}`)}</p>;
      })}
    </div>
  );
};
