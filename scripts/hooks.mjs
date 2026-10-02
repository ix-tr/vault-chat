import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(existsSync('.git')){mkdirSync('.githooks',{recursive:true});writeFileSync('.githooks/pre-commit','#!/bin/sh\nset -e\npnpm check\ngitleaks git --pre-commit --staged\n',{mode:0o755});const result=spawnSync('git',['config','core.hooksPath','.githooks'],{stdio:'inherit'});if(result.status!==0)process.exitCode=1;}
