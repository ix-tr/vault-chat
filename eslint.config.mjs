import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config({ignores:['**/.next/**','**/node_modules/**','**/next-env.d.ts','infra/runtime/**']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.mjs','**/*.js'],languageOptions:{globals:{process:'readonly',console:'readonly',document:'readonly',navigator:'readonly',self:'readonly',caches:'readonly',fetch:'readonly',URL:'readonly',AbortSignal:'readonly'}}});
