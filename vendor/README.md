# Dependência institucional

O pacote `@furg/design-system` é empacotado localmente nesta pasta para que builds on-premises não dependam de um registro privado. Execute antes de `pnpm install`:

```sh
pnpm vendor:design-system
```

Defina `FURG_DESIGN_SYSTEM_PATH` se o projeto canônico não estiver em `C:\Projetos\design-system-furg`.
