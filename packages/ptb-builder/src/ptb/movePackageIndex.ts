export type MovePackageFunctionVisibility =
  | 'public'
  | 'private'
  | 'friend'
  | 'unknown';

export type MovePackageFunctionEntry = {
  name: string;
  visibility: MovePackageFunctionVisibility;
  isEntry: boolean;
};

export type MovePackageFunctionIndex = Record<
  string,
  MovePackageFunctionEntry[]
>;

export function movePackageFunctionNames(
  functions: readonly MovePackageFunctionEntry[] | undefined,
): string[] {
  if (!functions) return [];
  return functions
    .map((entry) => entry.name)
    .filter((name) => name !== '')
    .sort((left, right) => left.localeCompare(right));
}

export function hasMovePackageFunction(
  modules: MovePackageFunctionIndex,
  moduleName: string,
  functionName: string,
): boolean {
  return movePackageFunctionNames(modules[moduleName]).includes(functionName);
}

export function sortMovePackageFunctionIndex(
  modules: MovePackageFunctionIndex,
): MovePackageFunctionIndex {
  return Object.fromEntries(
    Object.entries(modules)
      .map(
        ([moduleName, functions]) =>
          [moduleName, uniqueMovePackageFunctions(functions)] as const,
      )
      .filter(([, functions]) => functions.length > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function uniqueMovePackageFunctions(
  functions: readonly MovePackageFunctionEntry[],
): MovePackageFunctionEntry[] {
  const byName = new Map<string, MovePackageFunctionEntry>();
  for (const entry of functions) {
    if (entry.name === '' || byName.has(entry.name)) continue;
    byName.set(entry.name, entry);
  }
  return [...byName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}
