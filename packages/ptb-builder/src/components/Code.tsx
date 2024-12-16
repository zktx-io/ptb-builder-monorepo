import React, { useEffect, useState } from 'react';

import { Transaction } from '@mysten/sui/transactions';
import Prism from 'prismjs';
import { Resizable } from 're-resizable';

import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import { PTBEdge, PTBNode } from '../PTBFlow/nodes';
import { generateCode } from '../utilities/ptb/generateCode';
import { generatePtb } from '../utilities/ptb/generatePtb';

export const Code = ({
  nodes,
  edges,
  excuteTx,
}: {
  nodes: PTBNode[];
  edges: PTBEdge[];
  excuteTx?: (transaction: Transaction | undefined) => Promise<void>;
}) => {
  const language = 'javascript';

  const [code, setCode] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [isExcute, setIsExcute] = useState<boolean>(false);

  const handleExcuteTransaction = async () => {
    if (excuteTx && !isExcute) {
      setIsExcute(true);
      const transaction = await generatePtb(nodes, edges);
      await excuteTx(transaction);
      setIsExcute(false);
    }
  };

  useEffect(() => {
    if (isVisible) {
      Prism.highlightAll();
    }
  }, [code, isVisible]);

  useEffect(() => {
    setCode(() => generateCode(nodes, edges));
  }, [edges, nodes]);

  return (
    <div style={{ display: 'inline-block', fontSize: '12px' }}>
      <div className="flex items-center justify-end">
        <label className="text-xs text-gray-900 dark:text-gray-100 mr-1">
          Code
        </label>
        <input
          type="checkbox"
          checked={isVisible}
          style={{ pointerEvents: 'all' }}
          onChange={() => setIsVisible((state) => !state)}
        />
      </div>
      {code && isVisible && (
        <Resizable
          className="Code"
          style={{
            pointerEvents: 'all',
          }}
          handleClasses={{
            left: 'bg-gray-200 dark:bg-gray-600 w-0 h-full cursor-ew-resize',
          }}
          defaultSize={{
            width: '320px',
          }}
          minWidth="240px"
          enable={{
            left: true,
          }}
        >
          <pre className="line-numbers">
            <code className={`language-${language}`}>{code}</code>
          </pre>
        </Resizable>
      )}
      {code && isVisible && !!excuteTx && (
        <div className="flex items-center justify-end">
          <button
            disabled={isExcute}
            className="bg-red-500 text-white font-semibold py-2 px-4 rounded transition duration-300 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-400 disabled:cursor-not-allowed"
            style={{ pointerEvents: 'all' }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleExcuteTransaction}
          >
            Excute
          </button>
        </div>
      )}
    </div>
  );
};
