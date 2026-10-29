/** The one toggle switch used everywhere in the app (same look as in the stem separation tab). */
export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  label?: string;
  title?: string;
  disabled?: boolean;
}) {
  const { checked, onChange, id, label, title, disabled } = props;
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-40 disabled:cursor-default ${checked ? "bg-sky-600" : "bg-slate-600"}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}
