import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../services/notification.service';
import { AdminRepository } from '../../admin/repository/admin.repository';
import { FirebaseService } from '../services/firebase.service';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly adminRepository: AdminRepository,
    private readonly firebaseService: FirebaseService,
  ) {}

  @OnEvent('user.created')
  async handleUserCreatedEvent(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(`Handling user.created event for ${payload.userId}`);
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Welcome to Greyfundr!',
      message: 'Your account has been successfully created.',
      type: 'account',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('security.login')
  async handleSecurityLoginEvent(payload: {
    userUuid: string;
    email: string;
    location?: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(`Handling security.login event for ${payload.userUuid}`);
    await this.notificationService.notify(payload.userUuid, 'securityAlerts', {
      title: 'New Login Detected',
      message: `A new login was detected for your account${payload.location ? ` from ${payload.location}` : ''}.`,
      type: 'security',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('campaign.live')
  async handleCampaignLiveEvent(payload: {
    userUuid: string;
    campaignName: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(`Handling campaign.live event for ${payload.userUuid}`);
    await this.notificationService.notify(payload.userUuid, 'campaignUpdates', {
      title: 'Campaign Live!',
      message: `Your campaign "${payload.campaignName}" is now live and accepting donations.`,
      type: 'campaign',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('donation.receipt')
  async handleDonationReceiptEvent(payload: {
    donorId: string;
    email: string;
    campaignName: string;
    amount: number;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(`Handling donation.receipt event for ${payload.donorId}`);
    await this.notificationService.notify(
      payload.donorId,
      'paymentConfirmations',
      {
        title: 'Donation Successful',
        message: `Thank you for your generous donation of ₦${payload.amount} to "${payload.campaignName}".`,
        type: 'transaction',
        metadata: {
          email: payload.email,
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('donation.received')
  async handleDonationReceivedEvent(payload: {
    creatorId: string;
    campaignName: string;
    amount: number;
    donorName: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(
      `Handling donation.received event for creator ${payload.creatorId}`,
    );
    await this.notificationService.notify(
      payload.creatorId,
      'campaignUpdates',
      {
        title: 'New Donation Received!',
        message: `"${payload.campaignName}" just received a donation of ₦${payload.amount} from ${payload.donorName}.`,
        type: 'campaign',
        metadata: {
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('campaign.milestone')
  async handleCampaignMilestoneEvent(payload: {
    creatorId: string;
    campaignName: string;
    percentage: number;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    this.logger.log(
      `Handling campaign.milestone event for creator ${payload.creatorId}`,
    );
    const message =
      payload.percentage === 100
        ? `Congratulations! Your campaign "${payload.campaignName}" has hit 100% of its target.`
        : `Great news! Your campaign "${payload.campaignName}" is halfway there (50%).`;

    await this.notificationService.notify(
      payload.creatorId,
      'campaignUpdates',
      {
        title: `Campaign Milestone: ${payload.percentage}%`,
        message,
        type: 'campaign',
        metadata: {
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('admin.campaign_created')
  async handleAdminCampaignCreatedEvent(payload: {
    campaignId: string;
    campaignTitle: string;
    creatorId: string;
  }) {
    this.logger.log(
      `Handling admin.campaign_created event for campaign ${payload.campaignId}`,
    );

    const admins = await this.adminRepository.findAll();
    if (!admins.length) {
      this.logger.warn('No admins found to notify for new campaign.');
      return;
    }

    await this.notificationService.notifyAllAdmins(admins, {
      title: 'New Campaign Created — Review Required',
      message: `A new campaign "${payload.campaignTitle}" has been submitted by creator ${payload.creatorId} and is awaiting your review.`,
      type: 'campaign',
      metadata: { campaignId: payload.campaignId },
    });
  }

  @OnEvent('admin.withdrawal_requested')
  async handleWithdrawalRequestedEvent(payload: {
    campaignId: string;
    creatorId: string;
    amount: number;
  }) {
    const admins = await this.adminRepository.findAll();

    await this.notificationService.notifyAllAdmins(admins, {
      title: 'Withdrawal Request',
      message: `A withdrawal of ₦${payload.amount.toLocaleString()} has been requested for campaign ${payload.campaignId}.`,
      type: 'transaction',
      metadata: {
        campaignId: payload.campaignId,
        creatorId: payload.creatorId,
      },
    });
  }

  @OnEvent('security.password_changed')
  async handlePasswordChangedEvent(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
    changedAt: Date;
  }) {
    this.logger.log(
      `Handling security.password_changed event for ${payload.userId}`,
    );

    const formattedTime = payload.changedAt.toLocaleString('en-NG', {
      timeZone: 'Africa/Lagos',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Password Changed',
      message: `Your password was successfully changed on ${formattedTime}. If you did not make this change, please contact support immediately.`,
      type: 'security',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('kyc.approved')
  async handleKycApproved(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: '✅ Identity Verified!',
      message:
        'Your identity has been successfully verified. You now have full access to GreyFundr.',
      type: 'kyc',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('kyc.declined')
  async handleKycDeclined(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Verification Declined',
      message:
        'Your identity verification was declined. Please contact support via live chat for assistance.',
      type: 'kyc',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('kyc.in_review')
  async handleKycInReview(payload: {
    userId: string;
    email: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Verification In Review',
      message:
        'Your identity verification is currently under review. We will notify you once complete.',
      type: 'kyc',
      metadata: {
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('kyc.name_mismatch')
  async handleKycNameMismatch(payload: {
    userId: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Verification Failed — Name Mismatch',
      message:
        'The name on your document does not match your registered name. Please contact support.',
      type: 'kyc',
      metadata: {
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('kyc.dob_mismatch')
  async handleKycDobMismatch(payload: {
    userId: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Verification Failed — Date of Birth Mismatch',
      message:
        'The date of birth on your document does not match your profile. ' +
        'Please update your date of birth and retry verification.',
      type: 'kyc',
      metadata: {
        phoneNumber: payload.phoneNumber,
        pushToken: payload.pushToken,
      },
    });
  }

  @OnEvent('split_bill.participant_added')
  async handleParticipantAdded(payload: {
    userId: string;
    email: string;
    billTitle: string;
    billId: string;
    participantId: string;
    amountOwed: number;
    currency: string;
    creatorName: string;
    phoneNumber?: string;
    pushToken?: string;
    paymentLink: string;
  }) {
    await this.notificationService.notify(
      payload.userId,
      'paymentConfirmations',
      {
        title: "You've been added to a split bill",
        message: `${payload.creatorName} added you to "${payload.billTitle}". Your share is ${payload.currency} ${payload.amountOwed.toLocaleString()}. Tap to view and pay: ${payload.paymentLink}`,
        type: 'split_bill',
        metadata: {
          email: payload.email,
          billId: payload.billId,
          participantId: payload.participantId,
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
          link: payload.paymentLink,
        },
      },
    );
  }

  @OnEvent('split_bill.guest_invited')
  async handleGuestInvited(payload: {
    guestName: string;
    guestPhone: string;
    billTitle: string;
    amountOwed: number;
    currency: string;
    creatorName: string;
    paymentLink: string;
  }) {
    this.logger.log(
      `Handling split_bill.guest_invited event for phone: ${payload.guestPhone}`,
    );

    const message = `Hi ${payload.guestName}, ${payload.creatorName} requested ${payload.currency} ${payload.amountOwed.toLocaleString()} for "${payload.billTitle}". Tap to pay your share securely on GreyFundr: ${payload.paymentLink}`;

    await this.notificationService.notifyGuest({
      title: "You've been added to a split bill",
      message,
      type: 'split_bill',
      metadata: {
        phoneNumber: payload.guestPhone,
        link: payload.paymentLink,
      },
    });
  }

  @OnEvent('split_bill.participant_accepted')
  async handleParticipantAccepted(payload: {
    creatorId: string;
    participantName: string;
    billTitle: string;
    billId: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(
      payload.creatorId,
      'paymentConfirmations',
      {
        title: 'Split bill invite accepted',
        message: `${payload.participantName} accepted their invite to "${payload.billTitle}".`,
        type: 'split_bill',
        metadata: {
          billId: payload.billId,
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('split_bill.participant_declined')
  async handleParticipantDeclined(payload: {
    creatorId: string;
    participantName: string;
    billTitle: string;
    billId: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(
      payload.creatorId,
      'paymentConfirmations',
      {
        title: 'Split bill invite declined',
        message: `${payload.participantName} declined their invite to "${payload.billTitle}".`,
        type: 'split_bill',
        metadata: {
          billId: payload.billId,
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('split_bill.payment_received')
  async handleBillPaymentReceived(payload: {
    creatorId: string;
    participantName: string;
    billTitle: string;
    billId: string;
    amount: number;
    currency: string;
    totalCollected: number;
    totalAmount: number;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(
      payload.creatorId,
      'paymentConfirmations',
      {
        title: 'Payment received on your split bill',
        message:
          `${payload.participantName} paid ${payload.currency} ${payload.amount.toLocaleString()} ` +
          `on "${payload.billTitle}". ` +
          `Total collected: ${payload.currency} ${payload.totalCollected.toLocaleString()} ` +
          `of ${payload.currency} ${payload.totalAmount.toLocaleString()}.`,
        type: 'split_bill',
        metadata: {
          billId: payload.billId,
          phoneNumber: payload.phoneNumber,
          pushToken: payload.pushToken,
        },
      },
    );
  }

  @OnEvent('wallet.funded')
  async handleWalletFunded(payload: {
    userId: string;
    amount: number;
    channel: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(
      payload.userId,
      'paymentConfirmations',
      {
        title: 'Wallet Top-up Successful',
        message: `Your wallet has been credited with ₦${payload.amount.toLocaleString()} via ${payload.channel}.`,
        type: 'transaction',
        metadata: {
          amount: payload.amount,
          channel: payload.channel,
        },
      },
    );
  }

  @OnEvent('withdrawal.completed')
  async handleWithdrawalCompleted(payload: {
    userId: string;
    amount: number;
    transferCode: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(
      payload.userId,
      'paymentConfirmations',
      {
        title: 'Withdrawal Successful',
        message: `Your withdrawal of ₦${payload.amount.toLocaleString()} has been processed successfully.`,
        type: 'transaction',
        metadata: { transferCode: payload.transferCode },
      },
    );
  }

  @OnEvent('withdrawal.failed')
  async handleWithdrawalFailed(payload: {
    userId: string;
    amount: number;
    reason: string;
    phoneNumber?: string;
    pushToken?: string;
  }) {
    await this.notificationService.notify(payload.userId, 'securityAlerts', {
      title: 'Withdrawal Failed',
      message: `Your withdrawal of ₦${payload.amount.toLocaleString()} failed: ${payload.reason}. The funds have been returned to your wallet.`,
      type: 'transaction',
      metadata: { amount: payload.amount, reason: payload.reason },
    });
  }
}
