# Programmable Transaction Blocks Builder (PTB Builder)

**PTB Builder** is a visual development tool for **Programmable Transaction Blocks (PTBs)**, a core technology of the Sui blockchain. Designed to create a powerful synergy with Sui’s PTB capabilities, this tool allows both developers and non-developers to easily construct and manage complex transactions, maximizing the potential of this advanced technology and making it more accessible to a broader audience.

![ptb-builder-editor.png](https://docs.zktx.io/images/ptb-builder-editor.png)

https://github.com/user-attachments/assets/0e7a3d47-451a-4cea-a36d-9df23d931cf2

## Demo

- Editor Mode: [https://ptb-builder.walrus.site/](https://ptb-builder.walrus.site/)
- Viewer Mode: `https://ptb-builder.walrus.site/viewer?tx=[[transaction hash]]`

## Key Use Cases

1. Transaction Construction and Pre-Testing:
   - Intuitive UI: Visually construct transactions through a drag-and-drop graphical interface.
   - Code Generation and Review: Verify automatically generated code from the constructed transactions and utilize it for dApp development.
   - Pre-Simulation: Simulate transaction behavior before actual execution to check expected results.
1. Executing Transactions Without Coding:
   - Non-Developer Friendly: Users without coding knowledge can construct and execute transactions, enabling individuals from various fields to utilize blockchain technology.
   - Real-Time Feedback: Provides real-time errors or warnings during transaction construction to help create correct transactions.
1. Saving and Sharing Graphs:
   - Save and Load Files: Save constructed transaction graphs as files and load them when needed.
   - Collaboration Features: Share saved graphs with team members or the community to promote collaboration, allowing transactions to be executed even without a dApp.
1. Transaction Visualization and Verification:
   - Visualization of Execution Results: Visually represent the results of executed programmable transactions for easy understanding.
   - Debugging Support: Provides debugging tools to trace and modify transaction flows when issues arise.

## Main Features

- Drag-and-Drop Interface: Easily construct transactions with a user-friendly interface.
- Automatic Code Generation: Automatically generates Move language code based on the transaction graph.
- Real-Time Error Detection: Instantly notifies errors occurring during construction to help create correct transactions.
- Multi-Language Support: Offers interfaces in various languages for convenient use by users worldwide.
- Extensibility: Expand functionality through plugins or modules, allowing for a customized tool.

## User Benefits

- Enhanced Development Efficiency: Reduce development time by constructing complex transactions quickly and accurately.
- Eased Learning Curve: Create and understand transactions without deep knowledge of the Move language.
- Cost Reduction: Decrease errors during development, reducing costs associated with debugging and fixing.
- Strengthened Collaboration: Promote team collaboration through graph sharing and joint work.

## Roadmap

1. Current Status:
   - Providing PoC Version: Offering an initial version equipped with basic transaction construction and execution features.
   - Collecting User Feedback: Improving the tool by incorporating users’ opinions.
1. Future Plans:
   - VS Code Integration: Plan to integrate PTB Builder into Sui’s VS Code development tool, Sui Extension, allowing developers to create and test transactions in a familiar environment.
   - Adding Advanced Features:
     - Version Control: Enable tracking and restoring changes through version control of transaction graphs.
     - Integrated Testing Environment: Provide a testing environment similar to the actual network to verify transaction behavior more accurately.

## Example

1. Editor Mode

   ```typescript
   // packages/example/src/pages/root.tsx
   import { PTBBuilder } from '@zktx.io/ptb-builder';

   export const Root = () => {
       return (
           <div style={{ width: '100vw', height: '100vh' }}>
           <PTBBuilder
               network="testnet"
               options={{
               themeSwitch: true,
               isEditor: true,
               }}
           />
           </div>
       );
   };

   ```

1. Viewer Mode

   ```typescript
   // packages/example/src/pages/viewer.tsx
   import { useEffect, useState } from 'react';

   import {
   getFullnodeUrl,
   SuiClient,
   TransactionBlockData,
   } from '@mysten/sui/client';
   import { PTBBuilder } from '@zktx.io/ptb-builder';
   import queryString from 'query-string';
   import { useLocation } from 'react-router-dom';

   export const Viewer = () => {
       const network = 'testnet';
       const location = useLocation();
       const [txData, setTxData] = useState<TransactionBlockData | undefined>(
           undefined,
       );

       useEffect(() => {
           const lodaData = async (txHash: string) => {
           const client = new SuiClient({
               url: getFullnodeUrl(network),
           });
           const res = await client.getTransactionBlock({
               digest: txHash!,
               options: {
               showInput: true,
               showObjectChanges: true,
               },
           });
           console.log(res);
           if (!res.errors && res.transaction) {
               setTxData(res.transaction.data);
           }
           };
           const parsed = queryString.parse(location.search);
           if (parsed.tx) {
           lodaData(parsed.tx as string);
           }
       }, [location.search]);

       return (
           <div style={{ width: '100vw', height: '100vh' }}>
           <PTBBuilder
               network={network}
               options={{
               themeSwitch: true,
               isEditor: false,
               txData,
               }}
           />
           </div>
       );
   };
   ```
