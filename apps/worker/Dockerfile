FROM golang:1.25-alpine AS build

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN go build -o /bin/turnoflow-worker ./cmd/worker

FROM alpine:3.20

WORKDIR /app
COPY --from=build /bin/turnoflow-worker /usr/local/bin/turnoflow-worker
CMD ["turnoflow-worker"]
