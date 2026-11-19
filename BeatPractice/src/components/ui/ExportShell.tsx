import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Modal, ModalHeader } from "./Modal";
import { btn } from "./styles";

// True while some step of the export is on screen. A step that opens in the same moment as another one closes (Next / Back)
// takes over its place without the fade-in, so the window does not blink; the first step of a flow still fades in.
let flowOpen = false;

/**
 * The shell of every step of the export. All steps have the SAME size (so the window does not jump from step to step) and the same bottom bar:
 * "Back" on the left (not on the first step), the actions on the right, and every button in the bar has the same width.
 * The content in the middle scrolls if it is taller than the window.
 */
export function ExportShell(props: {
  id: string;
  title: ReactNode;
  onClose: () => void;
  closeLabel: string;
  closeOnEscape?: boolean;
  onBack?: () => void;
  backLabel?: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  const { id, title, onClose, closeLabel, closeOnEscape = true, onBack, backLabel = "Back", footer, children } = props;
  const still = useRef(flowOpen).current;   // read while rendering: the previous step has not been cleaned up yet
  useEffect(() => {
    flowOpen = true;
    return () => { setTimeout(() => { flowOpen = false; }, 0); };   // cleared unless another step mounts right away
  }, []);
  return (
    <Modal id={id} width="2xl" onClose={onClose} closeOnEscape={closeOnEscape} scroll={false} still={still} className="flex h-[36rem] max-h-[92dvh] flex-col">
      <ModalHeader title={title} onClose={onClose} closeLabel={closeLabel} />
      <div className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-2">{children}</div>
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1 [&_button]:min-w-[9.5rem]">
        <div>
          {onBack && (
            <button type="button" id={`${id}-back`} className={btn.neutral} onClick={onBack}>
              <ArrowLeft className="icon-sm" />{backLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">{footer}</div>
      </div>
    </Modal>
  );
}
