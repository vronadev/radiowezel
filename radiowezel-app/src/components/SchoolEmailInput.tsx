import { Input } from "@/components/ui/input";
import { ghostDomainText, schoolEmailDomain } from "@/lib/schoolEmail";

type SchoolEmailInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  domain?: string;
};

const FIELD_TEXT = "text-sm font-normal leading-10 tracking-normal";

export function SchoolEmailInput({ id, value, onChange, error, disabled, domain }: SchoolEmailInputProps) {
  const suffix = domain ?? schoolEmailDomain();
  const ghost = ghostDomainText(value, suffix);
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <div className="relative h-10">
        <Input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          placeholder=""
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`relative z-0 h-10 bg-transparent py-0 ${FIELD_TEXT}`}
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-px z-10 flex items-center overflow-hidden px-3 ${FIELD_TEXT}`}
        >
          <span className="invisible whitespace-pre">{value}</span>
          {ghost ? <span className="ghost-domain whitespace-pre">{ghost}</span> : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
