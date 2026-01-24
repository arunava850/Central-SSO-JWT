# Security Checklist

## Pre-Deployment Security Checklist

### Configuration Security
- [ ] All sensitive values are in `.env` file (not committed to git)
- [ ] `.env` file has proper permissions (600 or 640)
- [ ] Private keys are stored securely (not in code or git)
- [ ] Client secrets are strong and rotated regularly
- [ ] Redirect URIs are validated against allowlist

### Application Security
- [ ] HTTPS is enabled in production
- [ ] PKCE is enforced for all OAuth flows
- [ ] State parameter validation is working
- [ ] Nonce validation is implemented
- [ ] JWT expiration is set appropriately (15 minutes)
- [ ] Rate limiting is configured
- [ ] Security headers (Helmet) are enabled
- [ ] CORS is properly configured with allowlist

### Infrastructure Security
- [ ] Firewall rules are configured (only 22, 80, 443 open)
- [ ] SSH key authentication is used (password auth disabled)
- [ ] SSL/TLS certificates are valid and auto-renewing
- [ ] Nginx security headers are configured
- [ ] Application runs as non-root user
- [ ] Logs are monitored for suspicious activity

### Microsoft Entra ID Configuration
- [ ] App registration has correct redirect URIs
- [ ] API permissions are minimal (principle of least privilege)
- [ ] Client secret expiration is managed
- [ ] Admin consent is granted for required permissions
- [ ] Conditional access policies are configured (if applicable)

### Code Security
- [ ] Dependencies are up to date (`npm audit`)
- [ ] No hardcoded secrets or keys
- [ ] Input validation is implemented
- [ ] Error messages don't leak sensitive information
- [ ] Session storage uses secure storage (Redis in production)

### Monitoring & Logging
- [ ] Application logs are centralized
- [ ] Failed authentication attempts are logged
- [ ] Token validation failures are logged
- [ ] Rate limit violations are logged
- [ ] Monitoring alerts are configured

## Production Deployment Security

### Server Hardening
- [ ] Operating system is up to date
- [ ] Unnecessary services are disabled
- [ ] Fail2ban or similar is configured
- [ ] Automatic security updates are enabled
- [ ] Disk encryption is enabled (if applicable)

### Network Security
- [ ] VPN or private network is used (if applicable)
- [ ] DDoS protection is configured
- [ ] WAF (Web Application Firewall) is considered
- [ ] Network segmentation is implemented

### Backup & Recovery
- [ ] Configuration files are backed up
- [ ] Private keys are backed up securely
- [ ] Recovery procedures are documented
- [ ] Disaster recovery plan is in place

## Ongoing Security

### Regular Tasks
- [ ] Review and rotate client secrets quarterly
- [ ] Update dependencies monthly
- [ ] Review access logs weekly
- [ ] Audit user permissions monthly
- [ ] Review security advisories

### Incident Response
- [ ] Incident response plan is documented
- [ ] Security contacts are defined
- [ ] Breach notification procedures are in place

## Security Best Practices

1. **Never expose private keys** - Keep them in secure storage, never in code or git
2. **Use HTTPS everywhere** - OAuth2 requires HTTPS in production
3. **Validate all inputs** - Never trust user input or query parameters
4. **Implement rate limiting** - Prevent brute force attacks
5. **Use short token expiration** - Minimize token lifetime to reduce risk
6. **Monitor and log** - Track all authentication attempts and failures
7. **Keep dependencies updated** - Regularly run `npm audit` and update packages
8. **Use principle of least privilege** - Grant minimal required permissions
9. **Implement defense in depth** - Multiple security layers
10. **Regular security audits** - Review code and configuration regularly
