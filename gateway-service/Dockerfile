# Build stage
FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /app

COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .

# Gradle은 settings.gradle에 선언된 모든 모듈 디렉터리가 존재해야 함
COPY common/build.gradle             common/
COPY analysis-service/build.gradle   analysis-service/
COPY eureka-service/build.gradle     eureka-service/
COPY gateway-service/build.gradle    gateway-service/
COPY auth-service/build.gradle       auth-service/
COPY config-service/build.gradle     config-service/
COPY market-service/build.gradle     market-service/
COPY community-service/build.gradle  community-service/
COPY point-service/build.gradle      point-service/
COPY infra/build.gradle              infra/
COPY notification-service/build.gradle notification-service/

RUN chmod +x gradlew && ./gradlew :gateway-service:dependencies --no-daemon 2>/dev/null || true

# 이 서비스에 필요한 소스만 복사
COPY common/src         common/src
COPY gateway-service/src gateway-service/src

RUN ./gradlew :gateway-service:bootJar --no-daemon -x test

# Runtime stage
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=builder /app/gateway-service/build/libs/*.jar app.jar

EXPOSE 9000

ENTRYPOINT ["java", "-jar", "app.jar"]
