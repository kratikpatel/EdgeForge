# Project Name: EdgeForge

## Project Description
EdgeForge is a distributed backend traffic management and simulation platform designed to demonstrate core system design concepts such as load balancing, rate limiting, service discovery, fault tolerance, and observability. Incoming client requests are routed through a load-balanced gateway layer that enforces distributed rate limits and forwards traffic to multiple backend service instances based on health and load.

The system includes a JavaScript-based simulation and observability dashboard that allows users to generate traffic patterns (normal load, traffic spikes, and abusive requests) and visualize system behavior in real time. This enables the study of how a distributed system responds under high load and partial failures while maintaining availability and performance.

The backend is implemented in Golang, focusing on networking, concurrency, and distributed system principles, while the frontend provides real-time monitoring and control of the simulation.

## Members
- Yash (Front-End Engineer)
- Kratik Patel (Back-End Engineer)

## Repository Link
https://github.com/kratikpatel/EdgeForge
