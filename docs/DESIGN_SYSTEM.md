# AttedDEL design system

Use Inter Variable from the bundled @fontsource package. Primary actions use indigo. Semantic colors in `src/index.css` map through Tailwind to background, surface, surface-muted, border, text, text-muted, primary, primary-foreground, success, warning, danger and info.

The root `.dark` class changes tokens. `attedel-theme` persists explicit light/dark selection. System preference supplies the initial default. Keep camera pixels and overlays on invariant dark backgrounds.

Use the shared `components/ui` exports for Button, IconButton, fields, cards, badges, tabs, modal/drawer, table, pagination, search, skeleton, empty/error states, avatar, progress, stepper, page headers and stats. Existing component prop contracts remain supported. Buttons default to at least 44px touch height. Inputs need visible associated labels. Icon buttons require a label.

Modal and Drawer use focus trapping, Escape dismissal and focus restoration. `useDialogFeedback` provides confirmations and result feedback for data screens. ToastProvider exposes useToast for transient notifications. Table can derive mobile labels from its header. Prefer explicit mobile cards when actions and multiple fields need room.

Use 4/8/12/16/24/32px spacing, rounded-xl cards, subtle borders and shadows. Keep focus-visible outlines. Motion must respect prefers-reduced-motion. Scores retain their API meaning. Display only measured values. Loading, no-data and failure feedback belong beside the affected content.
