# Environment Configuration — Project Alpha

## Database access

- Host: `db.prod.internal`
- User: `app_user`
- Password: [SECRET_L1]db-password-123[/SECRET_L1]

## External API credentials

- Endpoint: `https://api.service.com/v2`
- API Key: [SECRET_L1]api-key-abcdef-123456[/SECRET_L1]
- Refresh token: [SECRET_L2]refresh-token-xyz-987654[/SECRET_L2]

## SSH private key (production server access)

DevOps team only. Use with `ssh -i key.pem deploy@prod.internal`.

[SECRET_L2]
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACBExampleFakeKeyDataHereForTestingPurposesOnly123456AAAA
BCFakePrivateKeyContentForDemonstrationAndTestingPurposesOnlyDoNot
UseInProduction+/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv
wxyz0123456789+/AAAAAAAAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0e
HyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5OjsAAAA=
-----END OPENSSH PRIVATE KEY-----
```
[/SECRET_L2]

