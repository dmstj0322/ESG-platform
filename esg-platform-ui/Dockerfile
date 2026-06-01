# 1단계: 빌드 환경 (Node.js)
FROM node:22 AS build
WORKDIR /app

# 패키지 설치 파일 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# 소스 코드 복사 및 빌드
COPY . .
RUN npm run build

# 2단계: 실행 환경 (Nginx)
FROM nginx:alpine

# Nginx의 기본 설정 파일 삭제 후 사용자 설정(필요 시)을 넣거나 기본 설정 유지
# 빌드된 정적 파일을 Nginx가 제공하는 웹 서버 경로로 복사
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx 포트 80 노출
EXPOSE 80

# Nginx 실행
CMD ["nginx", "-g", "daemon off;"]