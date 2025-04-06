# ใช้ Node.js base image
FROM node:18

# สร้าง working directory
WORKDIR /app

# Copy package files แล้ว install
COPY package*.json ./
RUN npm install

# Copy code ที่เหลือ
COPY . .

# สร้าง Prisma client
RUN npx prisma generate

# เปิด port ที่ใช้ (เช่น 3000)
EXPOSE 3000

# เริ่มรันแอป
CMD ["npm", "start"]
