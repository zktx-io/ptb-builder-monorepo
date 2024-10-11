import { PTBBuilder } from '@zktx.io/ptb-builder';

export const Root = () => {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <PTBBuilder
        network="testnet"
        options={{
          themeSwitch: true,
          isEditor: true,
        }}
      />
    </div>
  );
};
