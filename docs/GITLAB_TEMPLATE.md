# GitLab CI Template

```yaml
grabby_governance:
  image: node:20
  stage: test
  script:
    - npm ci
    - npm run grabby:validate
    - npm run grabby:policy:check
    - npm run grabby:session --check-all
```

This job keeps Grabby governance checks enforced in merge requests without calling external APIs.
