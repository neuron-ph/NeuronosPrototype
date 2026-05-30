import { NeuronLogo } from "./NeuronLogo";
import { getVoucherLogo } from "../utils/documentDesign";
import aplusLogo from "../assets/aplus-logo.svg";
import aplusLogoDark from "../assets/aplus-logo-dark.svg";

interface VoucherBrandLogoProps {
  height?: number;
}

// Logo shown on e-voucher headings. Locked to A Plus in prod; togglable in dev
// via Settings → Developer (see getVoucherLogo / documentDesign.ts).
export function VoucherBrandLogo({ height = 32 }: VoucherBrandLogoProps) {
  if (getVoucherLogo() === "neuron") {
    return <NeuronLogo height={height} />;
  }
  // A Plus reads ~44% larger than the Neuron wordmark at the same height.
  // Dark-mode variant (navy→white, gold kept) swaps in via the `.dark` class.
  const style = { height: height * 1.44, width: "auto" } as const;
  return (
    <>
      <img src={aplusLogo} alt="A Plus Logistics" className="dark:hidden" style={style} />
      <img src={aplusLogoDark} alt="A Plus Logistics" className="hidden dark:block" style={style} />
    </>
  );
}
