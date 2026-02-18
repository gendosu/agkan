import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFormatter } from '../../../src/cli/utils/output-formatter';

describe('output-formatter', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('createFormatter', () => {
    it('should return JsonFormatter when json option is true', () => {
      const formatter = createFormatter({ json: true });
      expect(formatter).toBeDefined();
      expect(typeof formatter.output).toBe('function');
      expect(typeof formatter.error).toBe('function');
    });

    it('should return TextFormatter when json option is false', () => {
      const formatter = createFormatter({ json: false });
      expect(formatter).toBeDefined();
      expect(typeof formatter.output).toBe('function');
      expect(typeof formatter.error).toBe('function');
    });

    it('should return TextFormatter when json option is undefined', () => {
      const formatter = createFormatter({});
      expect(formatter).toBeDefined();
    });
  });

  describe('JsonFormatter', () => {
    it('should output JSON from jsonDataProvider', () => {
      const formatter = createFormatter({ json: true });
      const data = { id: 1, title: 'Test' };

      formatter.output(
        () => data,
        () => {
          throw new Error('textRender should not be called in JSON mode');
        }
      );

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(output).toEqual(data);
    });

    it('should not call textRender in JSON mode', () => {
      const formatter = createFormatter({ json: true });
      const textRender = vi.fn();

      formatter.output(() => ({ test: true }), textRender);

      expect(textRender).not.toHaveBeenCalled();
    });

    it('should output error as JSON with success: false', () => {
      const formatter = createFormatter({ json: true });

      formatter.error('Something went wrong');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(output.success).toBe(false);
      expect(output.error.message).toBe('Something went wrong');
    });

    it('should not call custom textRender in JSON error mode', () => {
      const formatter = createFormatter({ json: true });
      const textRender = vi.fn();

      formatter.error('Error message', textRender);

      expect(textRender).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledOnce();
    });

    it('should output JSON with pretty printing (2 spaces)', () => {
      const formatter = createFormatter({ json: true });

      formatter.output(
        () => ({ key: 'value' }),
        () => {}
      );

      const rawOutput = consoleSpy.mock.calls[0][0] as string;
      expect(rawOutput).toBe(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('should call jsonDataProvider lazily only once', () => {
      const formatter = createFormatter({ json: true });
      const provider = vi.fn(() => ({ data: 'test' }));

      formatter.output(provider, () => {});

      expect(provider).toHaveBeenCalledOnce();
    });
  });

  describe('TextFormatter', () => {
    it('should call textRender and not output JSON', () => {
      const formatter = createFormatter({ json: false });
      const textRender = vi.fn();

      formatter.output(() => ({ test: true }), textRender);

      expect(textRender).toHaveBeenCalledOnce();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should not call jsonDataProvider in text mode', () => {
      const formatter = createFormatter({ json: false });
      const provider = vi.fn(() => ({ data: 'test' }));

      formatter.output(provider, () => {});

      expect(provider).not.toHaveBeenCalled();
    });

    it('should call custom textRender for error', () => {
      const formatter = createFormatter({ json: false });
      const textRender = vi.fn();

      formatter.error('Something went wrong', textRender);

      expect(textRender).toHaveBeenCalledOnce();
    });

    it('should output default red error message when no textRender provided', () => {
      const formatter = createFormatter({ json: false });

      formatter.error('Default error message');

      expect(consoleSpy).toHaveBeenCalledOnce();
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('Default error message');
    });

    it('should use default error format when textRender is not provided', () => {
      const formatter = createFormatter({});

      formatter.error('Test error');

      expect(consoleSpy).toHaveBeenCalledOnce();
    });
  });
});
