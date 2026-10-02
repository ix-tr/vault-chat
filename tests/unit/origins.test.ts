import { expect, test } from 'vitest';
import { assertSeparateOrigins } from '../../packages/shared/src';
test('admin requires a distinct HTTPS hostname',()=>{
 expect(()=>assertSeparateOrigins('https://chat.localhost','https://admin.localhost')).not.toThrow();
 expect(()=>assertSeparateOrigins('https://chat.localhost','https://chat.localhost:8443')).toThrow();
 expect(()=>assertSeparateOrigins('http://chat.localhost','https://admin.localhost')).toThrow();
});
