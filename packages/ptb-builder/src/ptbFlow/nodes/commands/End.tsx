import React from 'react';

import { PTBNodeProp } from '..';
import { IconAbort, IconFailure, IconSuccess } from '../../../icons';
import { PtbHandleProcess } from '../handles';
import { NodeStyles } from '../styles';

export const End = ({ id, data }: PTBNodeProp) => {
  const getLabel = () => {
    if (
      data.value &&
      Array.isArray(data.value) &&
      typeof data.value[0] === 'string'
    ) {
      if (data.value[1] && (data.value[1] as string).startsWith('MoveAbort')) {
        return 'Abort';
      }
      return data.value[0].charAt(0).toUpperCase() + data.value[0].slice(1);
    }
    return 'End';
  };
  const TxResult = () => {
    if (Array.isArray(data.value)) {
      switch (data.value[0]) {
        case 'success':
          return <IconSuccess />;
        case 'failure':
          if ((data.value[1] as string).startsWith('MoveAbort')) {
            return <IconAbort />;
          }
          return <IconFailure />;
        default:
          return <></>;
      }
    }
  };
  return (
    <div className={`${NodeStyles.startEnd} relative`}>
      <p className="text-base text-center text-gray-700 dark:text-gray-400">
        {getLabel()}
      </p>
      {data.value && (
        <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
          <TxResult />
        </div>
      )}
      <PtbHandleProcess typeHandle="target" />
    </div>
  );
};
