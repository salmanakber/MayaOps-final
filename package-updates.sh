#!/bin/bash
# Run this to install all required dependencies

npm install pdfkit @types/pdfkit
npm install @sendgrid/mail
npm install @aws-sdk/client-ses @aws-sdk/client-s3
npm install ioredis @types/ioredis
npm install node-cron @types/node-cron
npm install -D @types/jest jest ts-jest
npm install -D @types/node

echo "Dependencies installed successfully"
