import React, { useEffect } from 'react';

import { TransactionBlockData } from '@mysten/sui/client';
import { useReactFlow } from '@xyflow/react';

import { NETWORK, useStateContext, useStateUpdateContext } from '../provider';
import { autoLayoutFlow } from './autoLayoutFlow';
import { fromJson } from '../utilities/json/fromJson';
import { DEFAULT } from '../utilities/json/types';
import { parseTxb } from '../utilities/ptb/parseTxb';

export const Parse = () => {
  const setState = useStateUpdateContext();
  const { txbOrPtb } = useStateContext();
  const { fitView, getNodes, getEdges, setNodes, setEdges } = useReactFlow();
  useEffect(() => {
    const autoLayout = async (data: TransactionBlockData | string) => {
      if (typeof data !== 'string') {
        const parsed = parseTxb(data);
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          await autoLayoutFlow(
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
      setState((oldState) => ({ ...oldState, disableUpdate: true }));
    };
    txbOrPtb && autoLayout(txbOrPtb);
  }, [fitView, getEdges, getNodes, setEdges, setNodes, setState, txbOrPtb]);
  return <></>;
};
