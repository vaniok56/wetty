import { expect } from 'chai';
import 'mocha';
import * as sinon from 'sinon';

import { redirect } from './middleware';
import type { Request, Response } from 'express';

describe('redirect middleware', () => {
  let response: { redirect: sinon.SinonStub; sendStatus: sinon.SinonStub };
  let next: sinon.SinonStub;

  beforeEach(() => {
    response = { redirect: sinon.stub(), sendStatus: sinon.stub() };
    next = sinon.stub();
  });

  it('removes a local trailing slash and preserves the query', () => {
    redirect(
      { path: '/raspik/', url: '/raspik/?tab=1' } as Request,
      response as unknown as Response,
      next,
    );

    expect(response.redirect.calledOnceWith(301, '/raspik?tab=1')).to.be.true;
    expect(next.called).to.be.false;
  });

  it('rejects a protocol-relative target', () => {
    redirect(
      { path: '//evil.example/', url: '//evil.example/' } as Request,
      response as unknown as Response,
      next,
    );

    expect(response.sendStatus.calledOnceWith(400)).to.be.true;
    expect(response.redirect.called).to.be.false;
  });

  it('passes root requests onward', () => {
    redirect(
      { path: '/', url: '/' } as Request,
      response as unknown as Response,
      next,
    );

    expect(next.calledOnce).to.be.true;
    expect(response.redirect.called).to.be.false;
  });

  it('passes non-trailing paths onward', () => {
    redirect(
      { path: '/raspik', url: '/raspik?tab=1' } as Request,
      response as unknown as Response,
      next,
    );

    expect(next.calledOnce).to.be.true;
    expect(response.redirect.called).to.be.false;
  });
});
