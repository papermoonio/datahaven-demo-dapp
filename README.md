# DataHaven Demo dApp

A demo dApp for interacting with DataHaven through the StorageHub SDK. This implementation showcases connecting to wallet, connecting and authenticating with a Storage Provider, bucket management, and file operations.

A build of this demo is currently available at: https://datahavendemodapp.netlify.app/

## Features

- **Wallet Connection** - EVM Wallet interaction with automatic network switching to DataHaven testnet
- **Connection and SIWE Authentication with Main Storage Provider** - Prerequisite for bucket and file operations
- **Bucket Management** - Create, list, and delete storage buckets
- **File Operations** - Upload, download, and manage files within buckets
- **Storage Provider Monitoring** - View MSP connection status and health

## Tech Stack

- **React 19** with TypeScript
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **viem** - EVM wallet interaction
- **@polkadot/api** - Polkadot chain interaction
- **@storagehub-sdk** - StorageHub SDK for storage operations (@storagehub-sdk/core and @storagehub-sdk/msp-client)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- MetaMask or compatible EVM wallet

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

The app will be available at `http://localhost:5173`

### Build

```bash
pnpm build
```

### Lint

```bash
pnpm lint
```

## Project Structure

```
src/
├── pages/           # Dashboard, Buckets, Files pages
├── components/      # Reusable UI components
├── context/         # React Context for global state
├── hooks/           # Custom React hooks
├── services/        # Wallet & MSP client services
├── operations/      # Bucket and file operation logic
├── config/          # Network configuration
└── types/           # TypeScript type definitions
```

## Network Configuration

The app connects to the DataHaven Testnet:

| Property | Value |
|----------|-------|
| Network | DataHaven Testnet |
| Chain ID | 55931 (0xda7b) |
| RPC URL | `https://services.datahaven-testnet.network/testnet` |
| Currency | MOCK (18 decimals) |

## Usage Flow

1. **Connect Wallet** - Connect your MetaMask wallet (auto-switches to DataHaven testnet)
2. **Connect to MSP** - Establish connection to the storage provider
3. **Authenticate** - Sign a message to authenticate with the network
4. **Manage Storage** - Create buckets and upload/download files

## License

MIT
