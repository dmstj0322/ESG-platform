# Build stage
FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /app

COPY gradlew .
COPY gradle gradle
COPY build.gradle .
COPY settings.gradle .

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

RUN chmod +x gradlew && ./gradlew :notification-service:dependencies --no-daemon 2>/dev/null || true

COPY common/src              common/src
COPY notification-service/src notification-service/src

RUN ./gradlew :notification-service:bootJar --no-daemon -x test

# Runtime stage
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=builder /app/notification-service/build/libs/*.jar app.jar

EXPOSE 8086

ENTRYPOINT ["java", "-jar", "app.jar"]
