export interface CodeParam {
  name: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface NodeProp {
  id: string;
  data: {
    label: string;
    value: string | string[] | object;
    code: (params: CodeParam[]) => string;
  };
}
