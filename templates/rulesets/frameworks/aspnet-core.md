---
id: frameworks/aspnet-core
scope: global
kind: framework
signals:
  any:
    - glob: "**/*.csproj"
      content: "Microsoft.AspNetCore"
      weight: 1.0
    - glob: "**/Program.cs"
      content: "WebApplication"
      weight: 0.9
    - glob: "**/Startup.cs"
      weight: 0.8
    - file: "appsettings.json"
      weight: 0.6
extends:
  - languages/dotnet
  - policies/security
---

# RULESET: ASP.NET Core

## Purpose
- Standards for ASP.NET Core web applications and APIs
- Ensure secure and performant web service implementations
- Promote consistent API design patterns

## Standards
- Use minimal APIs for simple endpoints, controllers for complex scenarios
- Implement request validation using FluentValidation or DataAnnotations
- Use strongly-typed configuration with IOptions pattern
- Implement health checks for all services
- Use structured logging with correlation IDs
- Prefer async controller actions for I/O operations
- Use ProblemDetails for error responses (RFC 7807)
- Implement proper HTTP caching headers

## Security & Quality Gates
- Enable HTTPS redirection and HSTS
- Implement authentication and authorization middleware
- Use anti-forgery tokens for form submissions
- Validate all user input at API boundaries
- Never expose stack traces in production error responses
- Implement rate limiting for public endpoints
- Use secrets management (not appsettings) for credentials

## Non-Goals
- Prescribing specific frontend frameworks
- Dictating database choices
- Enforcing specific hosting providers

## References
- ASP.NET Core Best Practices
- OWASP Security Guidelines
- Microsoft REST API Guidelines
