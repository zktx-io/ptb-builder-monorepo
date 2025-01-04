import React from 'react';

import { PTBNodeProp } from '..';
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
          return (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 100 100"
              className="w-6 h-6"
            >
              <circle cx="50" cy="50" r="45" fill="#7DD3A1" />
              <polyline
                points="30,50 45,65 70,35"
                fill="none"
                stroke="white"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          );
        case 'failure':
          if ((data.value[1] as string).startsWith('MoveAbort')) {
            return (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 100 100"
                className="w-6 h-6"
              >
                <circle cx="50" cy="50" r="45" fill="#7191FC" />
                <polyline
                  points="30,50 45,65 70,35"
                  fill="none"
                  stroke="white"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          }
          return (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 100 100"
              className="w-6 h-6"
            >
              <circle cx="50" cy="50" r="45" fill="#E56767" />
              <line
                x1="50"
                y1="30"
                x2="50"
                y2="60"
                stroke="white"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <circle cx="50" cy="75" r="6" fill="white" />
            </svg>
          );
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
