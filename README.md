# MIA Serverless API Base

Template base para el desarrollo de APIs Serverless de **MIA AVANZA CONTIGO**.

Este proyecto define la estructura, configuración, seguridad y convenciones que deben utilizar las APIs backend de MIA sobre AWS.

El objetivo es que cada unidad funcional pueda partir de este template manteniendo una arquitectura consistente, segura y fácilmente mantenible.

---

## 1. Arquitectura

Las APIs de MIA utilizan:

- AWS Lambda
- Amazon API Gateway REST API
- AWS Cognito User Pools
- Amazon RDS PostgreSQL
- IAM Database Authentication
- AWS Systems Manager Parameter Store
- AWS Lambda Layers
- AWS VPC
- Serverless Framework
- AWS CodeBuild / CodePipeline para CI/CD

La arquitectura separa claramente las responsabilidades:

```text
API Gateway
     │
     ▼
   Lambda
     │
     ├── Business
     │
     ├── Shared Layers
     │
     └── PostgreSQL
            │
            └── PostgreSQL permissions
```

---

## 2. Estructura del proyecto

```text
mia-serverless-api-base/
│
├── handlers/
│   ├── health.mjs
│   └── example.mjs
│
├── business/
│   └── example.mjs
│
├── resources/
│   └── iam.yml
│
├── buildspec.yml
├── serverless.yml
├── package.json
├── package-lock.json
└── README.md
```

### `handlers/`

Contiene los entry points de las funciones Lambda.

Los handlers deben ser delgados y encargarse principalmente de:

- recibir el evento;
- validar la entrada;
- invocar la lógica de negocio;
- construir/devolver la respuesta.

La lógica de negocio no debe implementarse directamente dentro del handler.

### `business/`

Contiene la lógica de negocio de la API.

El objetivo es evitar que los handlers se conviertan en funciones grandes y difíciles de mantener.

Ejemplo:

```text
handler
   │
   ▼
business
   │
   ▼
layers / repositories / external services
```

### `resources/`

Contiene recursos de infraestructura AWS definidos mediante CloudFormation.

Actualmente:

```text
resources/
└── iam.yml
```

El archivo contiene:

- políticas IAM reutilizables;
- execution roles de Lambda.

A medida que una API necesite otros recursos AWS, podrán agregarse nuevos archivos dentro de `resources/`.

---

# 3. Lambdas del template

El template incluye dos Lambdas.

### Health

```text
GET /health
```

Su propósito es validar la conectividad y disponibilidad de la infraestructura principal de la API.

El `health`:

- está conectado a la VPC;
- utiliza el Database Layer;
- utiliza IAM Database Authentication;
- se conecta a PostgreSQL;
- utiliza el execution role con acceso a VPC y BD.

Flujo:

```text
GET /health
     │
     ▼
API Gateway
     │
     ▼
Lambda
     │
     ▼
VPC
     │
     ▼
Database Layer
     │
     ▼
IAM Database Authentication
     │
     ▼
RDS PostgreSQL
```

El endpoint `health` no utiliza Cognito.

### Example

```text
POST /example
```

Esta Lambda existe como **ejemplo de buenas prácticas** para los desarrolladores.

Su propósito es demostrar:

- endpoint POST;
- autenticación mediante Cognito;
- handler delgado;
- separación entre handler y business;
- utilización de Shared Layers;
- respuesta estandarizada.

El `example`:

- no necesita VPC;
- no necesita acceso a PostgreSQL;
- utiliza el Lambda Basic Execution Role;
- está protegido mediante Cognito.

Flujo:

```text
POST /example
     │
     ▼
API Gateway
     │
     ▼
Cognito Authorizer
     │
     ▼
Lambda
     │
     ▼
Business
     │
     ▼
Response Layer
```

---

# 4. Seguridad

## 4.1 Cognito

MIA utiliza un **Cognito User Pool compartido**.

Sin embargo, cada API tiene su propio API Gateway Authorizer.

```text
                 Cognito User Pool
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Wallet API    Lending API    Trust API
          │             │             │
      Authorizer     Authorizer     Authorizer
```

Esto permite que cada API mantenga independencia sobre su configuración de autorización sin duplicar el User Pool.

El User Pool ARN se configura por ambiente en `custom`.

---

## 4.2 IAM

Los execution roles de Lambda se separan según las necesidades de la función.

### LambdaBasicExecutionRole

Utilizado por Lambdas que solamente necesitan:

- ejecución;
- CloudWatch Logs.

Utiliza:

```text
AWSLambdaBasicExecutionRole
```

No tiene acceso a VPC ni a PostgreSQL.

### LambdaDatabaseExecutionRole

Utilizado por Lambdas que necesitan:

- CloudWatch Logs;
- acceso a VPC;
- conexión a PostgreSQL mediante IAM.

Utiliza:

```text
AWSLambdaBasicExecutionRole
AWSLambdaVPCAccessExecutionRole
DatabaseAccessPolicy
```

---

## 4.3 Database IAM Authentication

Las APIs no almacenan contraseñas de PostgreSQL.

La conexión utiliza IAM Database Authentication.

El flujo es:

```text
Lambda
   │
   ▼
IAM Execution Role
   │
   │ rds-db:connect
   ▼
PostgreSQL IAM User
   │
   ▼
PostgreSQL
```

Cada API tendrá un único usuario de PostgreSQL.

Por ejemplo:

```text
wallet_api
lending_api
trust_api
```

IAM determina si una API puede conectarse como su usuario.

PostgreSQL determina qué puede hacer ese usuario.

---

## 4.4 Autorización dentro de PostgreSQL

El acceso a schemas y objetos de PostgreSQL **no se administra mediante IAM**.

Se administra mediante los mecanismos propios de PostgreSQL:

- `GRANT`;
- `REVOKE`;
- permisos sobre schemas;
- permisos sobre tablas;
- permisos sobre secuencias;
- permisos sobre funciones.

Ejemplo conceptual:

```text
wallet_api
   │
   ├── wallet   → SELECT / INSERT / UPDATE
   ├── usuario  → SELECT
   └── trust    → SELECT
```

Esto permite que una API utilice recursos de diferentes schemas sin necesitar múltiples usuarios de BD.

---

# 5. Parameter Store

La configuración de runtime de la base de datos se almacena en AWS Systems Manager Parameter Store.

Ejemplo:

```text
/mia/dev/db/host
/mia/dev/db/port
/mia/dev/db/name
/mia/dev/db/user
```

Los parámetros pueden variar por ambiente.

El `serverless.yml` mantiene las referencias a estos parámetros.

La aplicación no debe almacenar:

- passwords;
- connection strings;
- credenciales;
- secretos

en el repositorio.

## 5.1 Separación de responsabilidades

La configuración se divide de la siguiente manera:

```text
custom
   │
   └── referencias/configuración de infraestructura

Parameter Store
   │
   └── configuración utilizada por runtime

PostgreSQL
   │
   └── autorización sobre schemas y datos

IAM
   │
   └── acceso a recursos AWS
```

---

# 6. VPC

La VPC se configura **por Lambda**, no globalmente en `provider`.

Esto permite que una API tenga Lambdas dentro y fuera de la VPC.

Ejemplo:

```text
health
  └── VPC ✅

example
  └── VPC ❌
```

La configuración de VPC se mantiene en `custom` por ambiente:

```yaml
custom:

  VPC:
    dev:
      securityGroupIds:
        - sg-xxxxxxxx
      subnetIds:
        - subnet-xxxxxxxx
        - subnet-yyyyyyyy
```

Una Lambda utiliza esa configuración:

```yaml
vpc:
  securityGroupIds: ${self:custom.VPC.${self:provider.stage}.securityGroupIds}
  subnetIds: ${self:custom.VPC.${self:provider.stage}.subnetIds}
```

---

# 7. Stages

Los ambientes están definidos mediante Serverless stages.

Actualmente:

```text
dev
qa
prod
```

El stage puede especificarse mediante:

```bash
npx serverless deploy --stage dev
```

Si no se especifica, el `serverless.yml` utiliza:

```yaml
stage: ${opt:stage, 'dev'}
```

Por lo tanto, el ambiente por defecto es `dev`.

---

# 8. Serverless Framework

Serverless Framework se instala como una `devDependency` del proyecto.

No debe instalarse globalmente.

Esto garantiza que todos los desarrolladores y los pipelines utilicen la versión definida por el proyecto.

Ejemplo:

```json
{
  "devDependencies": {
    "serverless": "VERSION"
  }
}
```

El `package-lock.json` debe mantenerse en el repositorio.

Para instalar exactamente las dependencias bloqueadas:

```bash
npm ci
```

Para ejecutar Serverless:

```bash
npx serverless
```

---

# 9. Instalación local

Requisitos:

- Node.js 24.x
- npm
- acceso a AWS
- permisos suficientes para desplegar el servicio

Instalar dependencias:

```bash
npm ci
```

---

# 10. Despliegue manual

Para desplegar en DEV:

```bash
npx serverless deploy --stage dev
```

Para QA:

```bash
npx serverless deploy --stage qa
```

Para producción:

```bash
npx serverless deploy --stage prod
```

---

# 11. Build y empaquetado

Las Lambdas **no se compilan ni se bundlean manualmente**.

El proyecto utiliza el código fuente directamente dentro del paquete de Lambda.

No se utiliza:

```text
webpack
esbuild
serverless-esbuild
```

ni herramientas equivalentes para generar un bundle de las funciones.

Esto favorece:

- debugging;
- trazabilidad;
- lectura de stack traces;
- facilidad para investigar errores;
- simplicidad del despliegue.

La optimización del tamaño de las dependencias se maneja mediante:

- Lambda Layers;
- dependencias correctamente definidas;
- separación de responsabilidades.

---

# 12. Serverless Offline

`serverless-offline` **no forma parte del template**.

La razón principal es que algunas capacidades críticas de la arquitectura dependen directamente de AWS:

- Lambda Layers;
- VPC;
- RDS;
- IAM Database Authentication;
- Cognito;
- API Gateway;
- Parameter Store.

Por lo tanto, la validación de integración debe realizarse sobre AWS.

---

# 13. Lambda Layers

Las dependencias compartidas entre APIs se manejan mediante Lambda Layers.

Las Layers permiten centralizar componentes comunes como:

- acceso a PostgreSQL;
- respuestas estándar;
- autenticación;
- utilidades comunes.

Las APIs no deben duplicar código que ya pertenece a una Shared Layer.

La configuración de las Layers debe mantenerse centralizada y controlada.

Los desarrolladores no deben modificar arbitrariamente las Layers desde cada API.

---

# 14. CI/CD

El despliegue automatizado utiliza:

```text
GitHub
   │
   ▼
AWS CodePipeline
   │
   ▼
AWS CodeBuild
   │
   ▼
buildspec.yml
   │
   ▼
npx serverless deploy
```

El ambiente se determina a partir de la rama de Git.

Conceptualmente:

```text
dev branch
    ↓
STAGE=dev

qa branch
    ↓
STAGE=qa

prod branch
    ↓
STAGE=prod
```

El `buildspec.yml` no determina el ambiente.

Recibe el valor `STAGE` proporcionado por el pipeline.

---

# 15. Buildspec

El pipeline utiliza `buildspec.yml`.

El build realiza:

1. instalación de dependencias;
2. validación de `STAGE`;
3. despliegue mediante Serverless Framework.

```text
npm ci
   ↓
validate STAGE
   ↓
npx serverless deploy --stage $STAGE
```

No se realiza un build o bundle de las Lambdas.

---

# 16. Convenciones

## Handlers

Los handlers deben permanecer pequeños.

Evitar:

```text
handler
 └── 500 líneas de lógica
```

Preferir:

```text
handler
   │
   ▼
business
   │
   ▼
layers / services
```

## Business

La lógica de negocio debe estar fuera del handler siempre que sea razonable.

## Environment variables

No utilizar environment variables para almacenar secretos.

Las variables relacionadas con configuración sensible deben obtener sus valores desde AWS Parameter Store o los mecanismos de secretos correspondientes.

## IAM

Aplicar least privilege.

No utilizar:

```yaml
Resource: "*"
```

cuando sea posible restringir el recurso.

Los permisos IAM deben representar acceso a recursos AWS.

Los permisos de datos de PostgreSQL deben permanecer en PostgreSQL.

## Roles

No crear roles específicos como:

```text
DbReadOnlyRole
DbReadWriteRole
```

para representar permisos de PostgreSQL.

La lectura/escritura de datos debe ser controlada mediante PostgreSQL.

Los roles IAM representan las capacidades AWS que necesita una Lambda.

---

# 17. Reglas del template

Al crear una nueva API a partir de este template:

### Mantener

- estructura de carpetas;
- Serverless Framework;
- Node.js 24;
- package-lock.json;
- Layers compartidas;
- IAM con least privilege;
- Parameter Store;
- separación handler/business;
- convenciones de stages.

### Evitar

- instalar Serverless globalmente;
- agregar `serverless-offline`;
- almacenar secretos en Git;
- duplicar código de Layers;
- agregar permisos IAM innecesarios;
- crear roles de BD por operación CRUD;
- meter toda la API dentro de la VPC sin necesidad;
- bundlear las Lambdas sin una razón técnica clara.

---

# 18. Filosofía arquitectónica

El template busca mantener una separación clara de responsabilidades:

```text
┌───────────────────────────────────────────┐
│ API Gateway                               │
│ Routing / Authentication                  │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│ Lambda                                    │
│ Orquestación / Handler                    │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│ Business                                  │
│ Lógica de negocio                         │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│ Shared Layers                             │
│ Capacidades técnicas compartidas          │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│ AWS / PostgreSQL                          │
│ Infraestructura y persistencia            │
└───────────────────────────────────────────┘
```

La regla fundamental es:

> **Cada componente debe ser responsable de una sola preocupación y los permisos deben otorgarse en el nivel donde realmente corresponden.**

---

# 19. Estado del template

El template base incluye actualmente:

- [x] AWS Lambda
- [x] API Gateway REST API
- [x] Node.js 24
- [x] Serverless Framework
- [x] Health Lambda
- [x] Example Lambda
- [x] Cognito User Pool integration
- [x] API-specific Cognito Authorizer
- [x] Lambda IAM roles
- [x] IAM Database Authentication
- [x] PostgreSQL
- [x] VPC configuration
- [x] Parameter Store
- [x] Shared Lambda Layers
- [x] `buildspec.yml`
- [x] Manual Serverless deployment

Pendiente:

- [ ] GitHub → CodePipeline
- [ ] CodePipeline → CodeBuild
- [ ] Automatización por branch/stage
- [ ] CI/CD completo
