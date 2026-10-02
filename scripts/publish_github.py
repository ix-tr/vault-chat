#!/usr/bin/env python3
"""Publish the reviewed foundation to a private GitHub repo without exposing tokens."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OWNER = 'ix-tr'
REPOSITORY = 'vault-chat'


def run(args, env, capture=False):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return result.stdout if capture else ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-only', action='store_true', help='Stage and scan; do not contact GitHub.')
    options = parser.parse_args()
    env = dict(os.environ)
    for key in list(env):
        if key.startswith('GIT_TRACE') or key == 'GIT_CURL_VERBOSE':
            del env[key]
    with tempfile.TemporaryDirectory(prefix='vault-publish-') as directory:
        metadata = str(Path(directory) / 'repository.git')
        run(['git', 'init', '--bare', '--initial-branch=main', metadata], env)
        env.update(GIT_DIR=metadata, GIT_WORK_TREE=str(ROOT))
        run(['git', 'add', '--all'], env)
        paths = run(['git', 'ls-files'], env, capture=True).splitlines()
        forbidden = {'.token', 'supabasesettings', '.env'}
        if forbidden.intersection(paths):
            raise RuntimeError('Credential file found in staged paths; publishing refused.')
        run(['gitleaks', 'git', '--pre-commit', '--staged', '--redact', '--no-banner'], env)
        print(f'{len(paths)} files staged; secret scan passed.', flush=True)
        if options.prepare_only:
            print('Preparation only: no remote repository created and no files uploaded.')
            return
        token_file = ROOT / '.token'
        token = token_file.read_text().strip()
        if not token or '\n' in token or '\r' in token:
            raise RuntimeError('.token must contain a single access token.')

        def api(path, data=None, allow_missing=False):
            request = urllib.request.Request(
                'https://api.github.com' + path,
                data=None if data is None else json.dumps(data).encode(),
                headers={'Authorization': 'Bearer ' + token,
                         'Accept': 'application/vnd.github+json',
                         'X-GitHub-Api-Version': '2022-11-28',
                         'User-Agent': 'vault-chat-setup', 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=20) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if allow_missing and error.code == 404:
                    return None
                raise RuntimeError(f'GitHub API returned HTTP {error.code}; check token permissions.') from None
            except urllib.error.URLError:
                raise RuntimeError('GitHub connection failed; check this terminal\'s network/DNS.') from None

        account = api('/user')
        if account['login'].lower() != OWNER:
            raise RuntimeError('Token account does not match the authorized GitHub owner.')
        remote = api(f'/repos/{OWNER}/{REPOSITORY}', allow_missing=True)
        if remote is not None and not remote['private']:
            raise RuntimeError('Existing repository is public; publishing refused.')
        if remote is not None and remote['size'] != 0:
            raise RuntimeError('Existing repository contains data. Stop and inspect it before publishing.')
        run(['git', '-c', f'user.name={OWNER}', '-c', f'user.email={account["id"]}+{OWNER}@users.noreply.github.com',
             'commit', '-m', 'feat: scaffold Vault Chat and Netlify development setup'], env)
        if remote is None:
            remote = api('/user/repos', {'name': REPOSITORY, 'private': True, 'auto_init': False,
                                        'description': 'Vault Chat secure messenger — foundation in development'})
        if not remote['private']:
            raise RuntimeError('Private repository creation was not confirmed; uploading refused.')
        helper = Path(directory) / 'askpass.py'
        helper.write_text('#!/usr/bin/env python3\nimport os,sys\nfrom pathlib import Path\n'
                          'print("x-access-token" if "username" in sys.argv[1].lower() '
                          'else Path(os.environ["VAULT_GITHUB_TOKEN_FILE"]).read_text().strip())\n')
        helper.chmod(0o700)
        env.update(GIT_ASKPASS=str(helper), GIT_TERMINAL_PROMPT='0', VAULT_GITHUB_TOKEN_FILE=str(token_file))
        run(['git', '-c', 'credential.helper=', 'push', f'https://github.com/{OWNER}/{REPOSITORY}.git', 'main:main'], env)
        print(f'Published private repository: https://github.com/{OWNER}/{REPOSITORY}')
        print('The local .git directory was not modified. Select this repository in Netlify.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f'Publishing stopped: {error}')
        raise SystemExit(1)
