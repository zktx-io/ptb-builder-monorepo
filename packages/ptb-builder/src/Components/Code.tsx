import React, { useEffect, useState } from 'react';

import { Edge, Node } from '@xyflow/react';
import Prism from 'prismjs';
import { Resizable } from 're-resizable';

import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers.css';
import 'prismjs/plugins/line-numbers/prism-line-numbers';
import { codeGenerate } from '../utils/move/codeGenerate';

export const Code = ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
  const language = 'javascript';

  const [code, setCode] = useState<string>('');
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    if (isVisible) {
      Prism.highlightAll();
    }
  }, [code, isVisible]);

  useEffect(() => {
    setCode(() => codeGenerate(nodes, edges));
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
          onChange={() => setIsVisible((state) => !state)}
        />
      </div>
      {code && isVisible && (
        <Resizable
          className="Code"
          defaultSize={{
            width: '320px',
          }}
          minWidth="240px"
          enable={{
            left: true,
            top: false,
            bottom: false,
            right: false,
            topLeft: false,
            topRight: false,
            bottomLeft: false,
            bottomRight: false,
          }}
        >
          <pre className="line-numbers">
            <code className={`language-${language}`}>{code}</code>
          </pre>
        </Resizable>
      )}
    </div>
  );
};
