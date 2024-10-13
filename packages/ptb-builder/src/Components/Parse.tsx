import React, { useEffect } from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { useReactFlow } from '@xyflow/react';

import { useStateContext } from '../Provider';
import { getLayoutedElements } from '../utils/getLayoutedElements';
import { parsePtb } from '../utils/ptb/parsePtb';

export const Parse = () => {
  const { txData } = useStateContext();
  const { fitView, getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  useEffect(() => {
    const autoLayout = async (data: TransactionBlockData) => {
      const parsed = parsePtb(data);
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        await getLayoutedElements(
          [...getNodes(), ...parsed.nodes],
          [...getEdges(), ...parsed.edges],
        );
      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
      setTimeout(() => {
        fitView();
      }, 10);
    };
    txData && setTimeout(() => autoLayout(txData), 50);
  }, [fitView, getEdges, getNodes, setEdges, setNodes, txData]);
  return <></>;
};
