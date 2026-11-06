import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('cloud-crm-timezone-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def before(self, target='staging'):
        return {'id': 'old-revision', 'containerId': release.IDS[target],
                'resources': {'memory': '1073741824', 'cores': '1', 'coreFraction': '20'},
                'concurrency': '1', 'connectivity': {'networkId': 'existing'},
                'serviceAccountId': 'existing-account', 'secrets': [{'id': 'existing-secret'}],
                'image': {'imageUrl': release.REPOSITORY + '@' + release.BASE, 'imageDigest': release.BASE,
                          'command': ['/app/container-start.sh'], 'args': [],
                          'environment': {'APP_ENV': target, 'RUN_MIGRATE_ON_START': '0',
                                          'RUN_STAGING_SEED_ON_START': '0', 'DB_NAME': 'lemuria_staging'}}}

    def test_candidate_preserves_permissions_network_database_and_resources(self):
        before = self.before()
        saved = copy.deepcopy(before)
        candidate = {'image': 'candidate@sha256:new', 'releaseId': 'candidate', 'sourceCommit': 'b' * 40}
        payload = release.payload(before, 'staging', candidate)
        self.assertEqual(before, saved)
        for key in ['resources', 'concurrency', 'connectivity', 'serviceAccountId', 'secrets', 'containerId']:
            self.assertEqual(payload[key], before[key])
        self.assertEqual(payload['imageSpec']['environment']['DB_NAME'], 'lemuria_staging')
        self.assertEqual(payload['imageSpec']['command'], {'command': ['/app/container-start.sh']})
        self.assertEqual(payload['imageSpec']['args'], {'args': []})
        self.assertEqual(payload['imageSpec']['imageUrl'], candidate['image'])

    def test_rollback_restores_saved_image_and_environment(self):
        before = self.before('production')
        payload = release.payload(before, 'production')
        self.assertEqual(payload['imageSpec']['imageUrl'], release.REPOSITORY + '@' + release.BASE)
        self.assertEqual(payload['imageSpec']['environment'], before['image']['environment'])

    def test_wrong_environment_and_startup_migrations_are_refused(self):
        with self.assertRaises(AssertionError): release.payload(self.before('production'), 'staging')
        for flag in ['RUN_MIGRATE_ON_START', 'RUN_STAGING_SEED_ON_START']:
            before = self.before(); before['image']['environment'][flag] = '1'
            with self.assertRaises(AssertionError): release.payload(before, 'staging')

    def test_database_name_read_does_not_expose_credentials(self):
        before = self.before()
        before['image']['environment']['DATABASE_URL'] = 'postgresql://example:example@local/lemuria_staging?sslmode=require'
        self.assertEqual(release.database_name(before), 'lemuria_staging')

if __name__ == '__main__': unittest.main()
