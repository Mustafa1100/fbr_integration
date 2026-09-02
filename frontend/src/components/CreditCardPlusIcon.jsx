// lucide "credit-card-plus" — not in this project's pinned lucide-react
// version, so reproduced locally with the same paths and a lucide-style
// `size` prop so it drops in next to the other icons.
export default function CreditCardPlus({ size = 24, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 18H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6" />
      <path d="M2 10h20" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
    </svg>
  )
}
