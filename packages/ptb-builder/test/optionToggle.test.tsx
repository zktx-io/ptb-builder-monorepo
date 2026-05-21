import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OptionToggle } from '../src/ui/nodes/vars/inputs/OptionToggle';

describe('OptionToggle', () => {
  it('uses track padding instead of an off-state thumb offset', () => {
    const markup = renderToStaticMarkup(<OptionToggle some={false} />);

    expect(markup).toContain('p-0.5');
    expect(markup).toContain('translate-x-0');
    expect(markup).not.toContain('translate-x-0.5');
  });
});
