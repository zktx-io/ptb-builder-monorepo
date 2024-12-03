import React, { useEffect } from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { useReactFlow } from '@xyflow/react';

import { NETWORK, useStateContext, useStateUpdateContext } from '../Provider';
import { getLayoutedElements } from '../utilities/getLayoutedElements';
import { fromJson } from '../utilities/json/fromJson';
import { DEFAULT } from '../utilities/json/types';
import { parsePtb } from '../utilities/ptb/parsePtb';

export const Parse = () => {
  const setState = useStateUpdateContext();
  const { txData, ptbJson } = useStateContext();
  const { fitView, getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  useEffect(() => {
    const autoLayout = async (data: TransactionBlockData | string) => {
      if (typeof data !== 'string') {
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
      } else {
        const {
          network,
          nodes: savedNodes,
          edges: savedEdges,
        }: DEFAULT = fromJson(data);
        setNodes([...savedNodes]);
        setEdges([...savedEdges]);
        setState((oldState) => ({ ...oldState, network: network as NETWORK }));
      }
    };
    txData && setTimeout(() => autoLayout(txData), 50);
    !txData && ptbJson && setTimeout(() => autoLayout(ptbJson), 50);
  }, [
    fitView,
    getEdges,
    getNodes,
    ptbJson,
    setEdges,
    setNodes,
    setState,
    txData,
  ]);
  return <></>;
};
