"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const http_1 = __importDefault(require("http"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
app.use((0, morgan_1.default)("[:date[clf]] :method :url :status :res[content-length] - :response-time ms"));
app.use(express_1.default.json());
app.use((0, cookie_parser_1.default)());
app.get('/', (req, res) => {
    res.send('Hello World!');
});
// Middleware to handle async errors
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.post('/identify', asyncHandler((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const email = req.body.email;
    const phone = req.body.phone;
    if (!email && !phone) {
        return res.status(400).json({ error: 'Either email or phone is required' });
    }
    let primaryContactDetails = yield prisma.contact.findUnique({
        where: {
            phoneNumber_email: { phoneNumber: phone, email: email },
        }
    });
    if (!primaryContactDetails) {
        primaryContactDetails = yield prisma.contact.create({
            data: {
                phoneNumber: phone,
                email: email,
                linkPrecedence: 'PRIMARY',
            }
        });
        return res.status(200).json({ contact: primaryContactDetails });
    }
    const secondaryContactDetails = yield prisma.contact.findMany({
        where: {
            linkPrecedence: 'SECONDARY',
            OR: [
                { phoneNumber: phone },
                { email: email }
            ]
        }
    });
    return res.status(200).json({
        contact: primaryContactDetails,
        linkedContacts: secondaryContactDetails
    });
})));
http_1.default.createServer(app).listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map