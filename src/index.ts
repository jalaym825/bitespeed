import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import http from 'http';
import { Prisma, PrismaClient } from '@prisma/client';

// Types
interface RequestBody {
    email?: string;
    phoneNumber?: string;
}

interface ContactResponse {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
}

type ContactWithRelations = Prisma.ContactGetPayload<{
    include: { linkedContacts: true; linkedContact: true };
}>;

// Services
class ContactService {
    constructor(private prisma: PrismaClient) {}

    async findContactByEmail(email: string) {
        return this.prisma.contact.findFirst({
            where: { email },
            include: {
                linkedContacts: true,
                linkedContact: true
            }
        });
    }

    async findContactByPhone(phoneNumber: string) {
        return this.prisma.contact.findFirst({
            where: { phoneNumber },
            include: {
                linkedContacts: true,
                linkedContact: true
            }
        });
    }

    async findContactByEmailAndPhone(email: string, phoneNumber: string) {
        return this.prisma.contact.findUnique({
            where: {
                phoneNumber_email: { phoneNumber, email }
            }
        });
    }

    async createSecondaryContact(email: string, phoneNumber: string, primaryContactId: number) {
        return this.prisma.contact.create({
            data: {
                phoneNumber,
                email,
                linkPrecedence: 'SECONDARY',
                linkedId: primaryContactId
            }
        });
    }

    async mergePrimaryContacts(primaryContact: ContactWithRelations, secondaryContact: ContactWithRelations) {
        // Update all contacts linked to secondary contact
        await this.prisma.contact.updateMany({
            where: { linkedId: secondaryContact.id },
            data: {
                linkPrecedence: 'SECONDARY',
                linkedId: primaryContact.id
            }
        });

        // Update the secondary contact itself
        await this.prisma.contact.update({
            where: { id: secondaryContact.id },
            data: {
                linkPrecedence: 'SECONDARY',
                linkedId: primaryContact.id
            }
        });

        // Ensure primary contact has correct status
        await this.prisma.contact.update({
            where: { id: primaryContact.id },
            data: {
                linkPrecedence: 'PRIMARY',
                linkedId: null
            }
        });
    }

    async createNewPrimaryContact(email: string, phoneNumber: string) {
        return this.prisma.contact.create({
            data: {
                phoneNumber,
                email,
                linkPrecedence: 'PRIMARY',
                linkedId: null
            },
            include: {
                linkedContacts: true,
                linkedContact: true
            }
        });
    }

    async getPrimaryContactDetails(contactId: number): Promise<ContactWithRelations | null> {
        return this.prisma.contact.findUnique({
            where: { id: contactId },
            include: {
                linkedContacts: true,
                linkedContact: true
            }
        });
    }

    formatContactResponse(primaryContact: ContactWithRelations): ContactResponse {
        const emails = [
            primaryContact.email, 
            ...primaryContact.linkedContacts.map(c => c.email)
        ].filter((email): email is string => email !== null);

        const phoneNumbers = [
            primaryContact.phoneNumber, 
            ...primaryContact.linkedContacts.map(c => c.phoneNumber)
        ].filter((phone): phone is string => phone !== null);

        return {
            primaryContatctId: primaryContact.id,
            emails,
            phoneNumbers,
            secondaryContactIds: primaryContact.linkedContacts.map(c => c.id)
        };
    }
}

// Middleware
const asyncHandler = 
    (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
    (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res, next)).catch(next);

// App initialization
const prisma = new PrismaClient();
const contactService = new ContactService(prisma);
const app = express();
const port = process.env.PORT || 3001;

// Middleware setup
app.use(morgan("[:date[clf]] :method :url :status :res[content-length] - :response-time ms"));
app.use(express.json());
app.use(cookieParser());

// Routes
app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

app.post(
    '/identify',
    asyncHandler(async (req: Request<{}, {}, RequestBody>, res: Response) => {
        const { email, phoneNumber } = req.body;

        // Validation
        if (!email && !phoneNumber) {
            return res.status(400).json({ error: 'Either email or phoneNumber is required' });
        }

        // Find existing contacts
        const [contactWithEmail, contactWithPhone] = await Promise.all([
            email ? contactService.findContactByEmail(email) : null,
            phoneNumber ? contactService.findContactByPhone(phoneNumber) : null
        ]);

        let primaryContactDetails: ContactWithRelations | null = null;

        // Handle case when both email and phone are provided but only one contact exists
        if (email && phoneNumber && 
            ((contactWithEmail && !contactWithPhone) || (!contactWithEmail && contactWithPhone))) {
            const existingContact = await contactService.findContactByEmailAndPhone(email, phoneNumber);
            
            if (!existingContact) {
                const primaryContact = contactWithEmail || contactWithPhone;
                if (primaryContact) {
                    const primaryContactId = primaryContact.linkedId || primaryContact.id;
                    await contactService.createSecondaryContact(email, phoneNumber, primaryContactId);
                    primaryContactDetails = await contactService.getPrimaryContactDetails(primaryContactId);
                }
            }
        }

        // Handle case when both contacts exist but are different
        if (contactWithEmail && contactWithPhone && contactWithEmail.id !== contactWithPhone.id && (contactWithEmail.linkPrecedence === 'PRIMARY' && contactWithPhone.linkPrecedence === 'PRIMARY')) {
            await contactService.mergePrimaryContacts(contactWithEmail, contactWithPhone);
            primaryContactDetails = await contactService.getPrimaryContactDetails(contactWithEmail.id);
        }

        // Handle case when no contacts exist
        if (!contactWithEmail && !contactWithPhone) {
            if (!email || !phoneNumber) {
                return res.status(400).json({ 
                    error: 'Email and phoneNumber are required to create new Contact' 
                });
            }
            // Create new contact and get its details directly
            primaryContactDetails = await contactService.createNewPrimaryContact(email, phoneNumber);
        }

        // If we haven't set primaryContactDetails yet, get it from existing contacts
        if (!primaryContactDetails && (contactWithEmail || contactWithPhone)) {
            const contact = contactWithEmail || contactWithPhone;
            if (contact) {
                const primaryContactId = contact.linkedId || contact.id;
                primaryContactDetails = await contactService.getPrimaryContactDetails(primaryContactId);
            }
        }

        if (!primaryContactDetails) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        const contact = contactService.formatContactResponse(primaryContactDetails);
        return res.status(200).json({ contact });
    })
);

// Server startup
http.createServer(app).listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});