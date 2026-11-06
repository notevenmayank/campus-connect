# Stage 1: Compile the C++ backend
FROM gcc:12-bookworm AS builder

WORKDIR /app
COPY server.cpp httplib.h ./

# Compile C++ backend with pthread support for Linux
RUN g++ -std=c++17 -O2 server.cpp -o campusconnect -lpthread

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim

WORKDIR /app

# Copy compiled binary and web assets
COPY --from=builder /app/campusconnect /app/campusconnect
COPY public /app/public
COPY data /app/data

# Ensure data directory exists and has write permissions
RUN mkdir -p /app/data && chmod -R 777 /app/data

ENV PORT=8080
EXPOSE 8080

CMD ["/app/campusconnect"]
