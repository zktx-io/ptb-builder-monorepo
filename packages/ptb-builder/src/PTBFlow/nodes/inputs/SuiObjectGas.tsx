import React from 'react';

import { type NodeProp } from '..';
import { PtbHandle } from '../handles';
import { FormStyle, LabelStyle, NodeStyles } from '../styles';

export const SuiObjectGas = ({ id, data }: NodeProp) => {
  return (
    <div className={NodeStyles.object}>
      <div className={FormStyle}>
        <label className={LabelStyle}>Gas Object</label>
      </div>
      <PtbHandle typeHandle="source" typeParams="object" name="inputs" />
    </div>
  );
};
