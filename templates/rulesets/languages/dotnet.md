---
id: languages/dotnet
scope: global
kind: language
signals:
  any:
    - glob: "**/*.sln"
      weight: 1.0
    - glob: "**/*.csproj"
      weight: 0.9
    - file: "global.json"
      weight: 0.8
    - file: "Directory.Build.props"
      weight: 0.7
    - file: "nuget.config"
      weight: 0.6
extends:
  - policies/security
---

# RULESET: .NET

## Purpose
- Standards for C# and .NET projects
- Ensure consistent project structure and coding conventions
- Promote modern .NET practices and patterns

## Standards
- Use SDK-style projects exclusively
- Enable nullable reference types in all projects
- Prefer dependency injection via built-in container
- Use async/await for I/O-bound operations
- Follow Microsoft naming conventions (PascalCase for public, camelCase for private)
- Use record types for immutable data structures
- Prefer pattern matching over type casting
- Use file-scoped namespaces to reduce nesting

## Security & Quality Gates
- All projects must target a supported .NET version
- Run `dotnet build --warnaserror` in CI
- Enforce code analysis with `EnableNETAnalyzers`
- Require XML documentation for public APIs
- Test coverage must exceed 80% for business logic

## Non-Goals
- Prescribing specific third-party libraries
- Enforcing specific IDE or editor settings
- Dictating deployment strategies

## References
- Microsoft .NET Coding Conventions
- C# Language Reference
