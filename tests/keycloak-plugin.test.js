const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverKeycloakRealms,
  discoverKeycloakClientConfig,
  buildKeycloakPluginContext,
} = require('../lib/plugins/keycloak.cjs');

describe('keycloak plugin', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grabby-keycloak-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeFixture() {
    fs.mkdirSync(path.join(dir, 'deploy', 'keycloak'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'deploy', 'keycloak', 'realm-export.json'), JSON.stringify({
      realm: 'platform',
      enabled: true,
      roles: {
        realm: [{ name: 'admin' }, { name: 'viewer' }],
      },
      groups: [{ name: 'platform-admins' }, { name: 'platform-readers' }],
      identityProviders: [{ alias: 'github', providerId: 'github', enabled: true }],
      clients: [
        {
          clientId: 'grabby-ui',
          publicClient: true,
          redirectUris: ['https://grabby.example.com/*'],
          webOrigins: ['https://grabby.example.com'],
        },
        {
          clientId: 'grabby-api',
          secret: 'super-secret',
          protocol: 'openid-connect',
          roles: [{ name: 'api-user' }],
        },
      ],
    }, null, 2), 'utf8');
  }

  test('discovers Keycloak realms, clients, and auth context without exposing secrets', () => {
    writeFixture();

    const realms = discoverKeycloakRealms(dir);
    const clients = discoverKeycloakClientConfig(dir);
    const context = buildKeycloakPluginContext(dir);

    expect(realms).toEqual([
      expect.objectContaining({
        file: 'deploy/keycloak/realm-export.json',
        realm: 'platform',
        clientCount: 2,
        realmRoles: ['admin', 'viewer'],
        groupCount: 2,
        groups: ['platform-admins', 'platform-readers'],
        identityProviders: [
          expect.objectContaining({
            alias: 'github',
            providerId: 'github',
            enabled: true,
          }),
        ],
      }),
    ]);
    expect(clients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        realm: 'platform',
        clientId: 'grabby-ui',
        publicClient: true,
        hasSecret: false,
        redirectUriCount: 1,
      }),
      expect.objectContaining({
        realm: 'platform',
        clientId: 'grabby-api',
        publicClient: false,
        hasSecret: true,
        roles: ['api-user'],
      }),
    ]));
    expect(context.summary).toEqual(expect.objectContaining({
      realmCount: 1,
      clientCount: 2,
      publicClientCount: 1,
      confidentialClientCount: 1,
      identityProviderCount: 1,
      realmNames: ['platform'],
    }));
  });
});
