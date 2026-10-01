import { createConfig, http } from 'wagmi';
import { mainnet, arbitrum, optimism, polygon } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [mainnet, arbitrum, optimism, polygon],
  connectors: [
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
  },
});
