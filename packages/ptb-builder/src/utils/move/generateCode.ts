import type { Edge, Node } from '@xyflow/react';

import { hasPath } from '../hasPath';

type Variable = {
  id: string;
  source: string;
  sourceHandle: string;
  targets: {
    target: string;
    targetHandle: string;
  }[];
};

const generateUniqueId = (id: number): string => {
  return `temp_${id}`;
};

const getNodeData = (id: string, nodes: Node[]): string | number => {
  const node = nodes.find((item) => item.id === id);
  if (node && node.data.value) {
    if (node.type === 'SuiNumber') {
      return parseInt(node.data.value as string);
    }
    if (node.type === 'SuiObject') {
      return `"${node.data.value}"`;
    }
    if (node.type === 'SuiObjectGas') {
      return `tx.gas`;
    }
    return typeof node.data.value === 'string'
      ? `"${node.data.value}"`
      : JSON.stringify(node.data.value);
  }
  return 'undefined';
};

export const generateCode = (nodes: Node[], edges: Edge[]): string => {
  const startNode = nodes.find((node) => node.type === 'Start');
  const endNode = nodes.find((node) => node.type === 'End');

  if (!startNode || !endNode) {
    return 'Start or End node missing.';
  }

  if (!hasPath(nodes, edges)) {
    return '';
  }

  const declaredVariables: Record<string, string> = {};
  const variableMap: Variable[] = [];
  const codeLines: { line: string; comment: string }[] = [
    {
      line: "// import { Transaction } from '@mysten/sui/transactions';",
      comment: '',
    },
    { line: 'const tx = new Transaction();', comment: '' },
  ];
  let index = 1;
  let variableCounter = 1;

  const addCodeLine = (line: string, comment: string) => {
    codeLines.push({ line, comment });
  };

  edges
    .filter((edge) => edge.type === 'Data')
    .forEach((edge) => {
      const isHas = variableMap.findIndex(
        (item) =>
          item.source === edge.source &&
          item.sourceHandle === edge.sourceHandle,
      );
      if (isHas < 0) {
        const id = generateUniqueId(index++);
        variableMap.push({
          id,
          source: edge.source,
          sourceHandle: edge.sourceHandle || '',
          targets: [
            {
              target: edge.target,
              targetHandle: edge.targetHandle || '',
            },
          ],
        });
      } else {
        variableMap[isHas].targets.push({
          target: edge.target,
          targetHandle: edge.targetHandle || '',
        });
      }
    });

  const processNode = (currentNode: Node) => {
    const inputs = variableMap
      .filter((variable) =>
        variable.targets.some((item) => item.target === currentNode.id),
      )
      .map((variable) => {
        let name = declaredVariables[variable.id];
        if (!name) {
          name = `val_${variableCounter++}`;
          declaredVariables[variable.id] = name;
          addCodeLine(
            `const ${name} = ${getNodeData(variable.source, nodes)};`,
            variable.sourceHandle,
          );
        }
        return {
          id: variable.id,
          name,
          sourceHandle: variable.sourceHandle,
          targetHandle:
            variable.targets.find((item) => item.target === currentNode.id)
              ?.targetHandle || '',
        };
      });

    const output = variableMap.find(
      (variable) => variable.source === currentNode.id,
    );

    if (output) {
      const outputId = output.id;
      const inputVariableNames = inputs
        .map((input) => declaredVariables[input.id])
        .join(', ');

      if (!declaredVariables[outputId]) {
        declaredVariables[outputId] = `val_${variableCounter++}`;
        addCodeLine(
          `let ${declaredVariables[outputId]} = undefined;`,
          output.sourceHandle,
        );
        if (
          currentNode.data.code &&
          typeof currentNode.data.code === 'function'
        ) {
          if (currentNode.type === 'SplitCoins') {
            const temp = `${declaredVariables[outputId]}_1`;
            addCodeLine(
              `const ${temp} = ${currentNode.data.code(inputs)};`,
              '',
            );
            const arg = inputs.find(
              (item) => item.targetHandle === 'amounts:number[]',
            );
            arg &&
              addCodeLine(
                `${declaredVariables[outputId]} = ${arg.name}.map((_, i) => ${temp}[i];`,
                '',
              );
          } else {
            addCodeLine(
              `${declaredVariables[outputId]} = ${currentNode.data.code(inputs)};`,
              '',
            );
          }
        } else {
          addCodeLine(
            `${declaredVariables[outputId]} = undefined;`,
            `${currentNode.type}(${inputVariableNames})`,
          );
        }
      } else {
        addCodeLine(
          `${declaredVariables[outputId]} = ${currentNode.type}(${inputVariableNames});`,
          '',
        );
      }
    } else {
      if (
        currentNode.data.code &&
        typeof currentNode.data.code === 'function'
      ) {
        addCodeLine(`${currentNode.data.code(inputs)};`, '');
      } else {
        addCodeLine(
          '',
          `${currentNode.type}(${inputs
            .map((input) => declaredVariables[input.id])
            .join(', ')})`,
        );
      }
    }
  };

  let currentCommand: Node | undefined = startNode;
  while (currentCommand && currentCommand.id !== endNode.id) {
    const currentCommandId: string = currentCommand.id;
    const nextEdge = edges.find(
      (edge) => edge.source === currentCommandId && edge.type === 'Path',
    );

    if (!nextEdge) break;

    const nextCommand = nodes.find((node) => node.id === nextEdge.target);

    if (nextCommand && nextCommand.type !== 'End') {
      processNode(nextCommand);
    }

    currentCommand = nextCommand;
  }

  const paddingSize = 40;
  const formattedCode =
    codeLines.length > 2
      ? codeLines
          .map((lineObj) =>
            lineObj.comment
              ? `${lineObj.line.padEnd(paddingSize)} // ${lineObj.comment}`.trim()
              : `${lineObj.line.padEnd(paddingSize)}`,
          )
          .join('\n')
      : '';

  return formattedCode;
};
