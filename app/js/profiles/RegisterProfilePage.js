import React, { Component, PropTypes } from 'react'
import { bindActionCreators } from 'redux'
import { connect } from 'react-redux'

import Alert from '../components/Alert'
import { AccountActions } from '../store/account'
import { IdentityActions } from '../store/identities'

import { getNamePrices, isNameAvailable,
         hasNameBeenPreordered, isABlockstackName } from '../utils/name-utils'
import { authorizationHeaderValue } from '../utils'

const WALLET_URL = '/wallet/deposit'

function mapStateToProps(state) {
  return {
    username: '',
    localIdentities: state.identities.localIdentities,
    lookupUrl: state.settings.api.nameLookupUrl,
    registerUrl: state.settings.api.registerUrl,
    priceUrl: state.settings.api.priceUrl,
    blockstackApiAppId: state.settings.api.blockstackApiAppId,
    blockstackApiAppSecret: state.settings.api.blockstackApiAppSecret,
    analyticsId: state.account.analyticsId,
    identityAddresses: state.account.identityAccount.addresses,
    api: state.settings.api,
    identityKeypairs: state.account.identityAccount.keypairs,
    registration: state.identities.registration,
    addressBalanceUrl: state.settings.api.addressBalanceUrl,
    coreWalletBalance: state.account.coreWallet.balance,
    coreWalletAddress: state.account.coreWallet.address
  }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(Object.assign({}, IdentityActions, AccountActions), dispatch)
}

class RegisterPage extends Component {
  static propTypes = {
    username: PropTypes.string.isRequired,
    localIdentities: PropTypes.object.isRequired,
    lookupUrl: PropTypes.string.isRequired,
    registerUrl: PropTypes.string.isRequired,
    blockstackApiAppId: PropTypes.string.isRequired,
    blockstackApiAppSecret: PropTypes.string.isRequired,
    analyticsId: PropTypes.string.isRequired,
    identityAddresses: PropTypes.array.isRequired,
    registerName: PropTypes.func.isRequired,
    identityKeypairs: PropTypes.array.isRequired,
    registration: PropTypes.object.isRequired,
    addressBalanceUrl: PropTypes.string.isRequired,
    refreshCoreWalletBalance: PropTypes.func.isRequired,
    coreWalletBalance: PropTypes.number.isRequired,
    coreWalletAddress: PropTypes.string
  }

  static contextTypes = {
    router: PropTypes.object.isRequired
  }

  constructor(props) {
    super(props)

    this.state = {
      registrationLock: false,
      username: props.username,
      nameCost: 0,
      alerts: [],
      type: 'person',
      tlds: {
        person: 'id',
        organization: 'corp'
      },
      nameLabels: {
        person: 'Username',
        organization: 'Domain'
      },
      zeroBalance: props.coreWalletBalance <= 0
    }

    this.onChange = this.onChange.bind(this)
    this.registerIdentity = this.registerIdentity.bind(this)
    this.updateAlert = this.updateAlert.bind(this)
    this.displayPricingAndAvailabilityAlerts = this.displayPricingAndAvailabilityAlerts.bind(this)
    this.displayRegistrationAlerts = this.displayRegistrationAlerts.bind(this)
    this.displayZeroBalanceAlert = this.displayZeroBalanceAlert.bind(this)
  }

  componentWillReceiveProps(nextProps) {

    // Clear alerts
    this.setState({
      alerts:[]
    })

    if(this.props.coreWalletAddress != nextProps.coreWalletAddress) {
      this.props.refreshCoreWalletBalance(nextProps.addressBalanceUrl, nextProps.coreWalletAddress)
    }

    const registration = nextProps.registration
    const zeroBalance = this.props.coreWalletBalance <= 0

    this.setState({
      zeroBalance: zeroBalance
    })

    if (zeroBalance) {
      this.displayZeroBalanceAlert()
    } else if (registration.registrationSubmitting ||
      registration.registrationSubmitted ||
      registration.profileUploading ||
      registration.error)
      this.displayRegistrationAlerts(registration)
    else {
      this.displayPricingAndAvailabilityAlerts(registration)
    }

  }

  componentDidMount() {
    if(this.props.coreWalletAddress != null) {
      this.props.refreshCoreWalletBalance(this.props.addressBalanceUrl, this.props.coreWalletAddress)
    }
    if (this.state.zeroBalance) {
      this.displayZeroBalanceAlert()
    }
  }

  displayRegistrationAlerts(registration) {
    if(registration.error) {
      this.updateAlert('danger', 'There was a problem submitting your registration.')
    } else {
      if(registration.profileUploading)
        this.updateAlert('info', 'Signing & uploading your profile...')
      else if(registration.registrationSubmitting)
        this.updateAlert('info', 'Submitting your registration to your Blockstack Core node...')
      else if(registration.registrationSubmitted)
        this.updateAlert('success', 'Congrats! Your name is preordered! Registration will automatically complete over the next few hours.')
    }
  }

  displayPricingAndAvailabilityAlerts(registration) {
    let tld = this.state.tlds[this.state.type]
    const domainName = `${this.state.username}.${tld}`

    if(domainName === registration.lastNameEntered) {
      if(registration.names[domainName].error) {
        const error = registration.names[domainName].error
        console.error(error)
        this.updateAlert('danger', `There was a problem checking on price & availability of ${domainName}`)
      } else {
        if(registration.names[domainName].checkingAvailability)
          this.updateAlert('info', `Checking if ${domainName} available...`)
        else if(registration.names[domainName].available) {
          if(registration.names[domainName].checkingPrice) {
            this.updateAlert('info', `${domainName} is available! Checking price...`)
          } else {
            const price = registration.names[domainName].price
            if(price < this.props.coreWalletBalance) {
              this.updateAlert('info', `${domainName} costs ~${price} btc to register.`)
            } else {
              const shortfall = price - this.props.coreWalletBalance
              this.updateAlert('danger', `Your wallet doesn't have enough money to buy ${domainName}. Please send at least ${shortfall} more bitcoin to your wallet.`, WALLET_URL)
            }
          }
        } else {
          this.updateAlert('danger', `${domainName} has already been registered.`)
        }
      }
    }
  }

  displayZeroBalanceAlert() {
    this.updateAlert('danger', `You need to deposit at least 0.01 bitcoins before you can register a username.<br> Click here to go to your wallet or send bitcoins directly to ${this.props.coreWalletAddress}`, WALLET_URL)
  }

  onChange(event) {
    if (event.target.name === 'username') {
      const username = event.target.value.toLowerCase().replace(/\W+/g, ''),
      tld = this.state.tlds[this.state.type],
      domainName = `${username}.${tld}`

      this.setState({
        username: username
      })

      if(username === '') {
        this.setState({
          alerts:[]
        })
        return
      }

      if(this.timer) {
        clearInterval(this.timer)
      }

      event.persist()
      const _this = this

      this.timer = setTimeout( () => {
        if(!isABlockstackName(domainName)) {
          _this.updateAlert('danger', `${domainName} Not valid Blockstack name`)
          return
        }

        this.props.checkNameAvailabilityAndPrice(this.props.api, domainName)

      },
      500) // wait 500ms after user stops typing to check availability
    }
  }

  updateAlert(alertStatus, alertMessage, url=null) {
    this.setState({
      alerts: [{
        status: alertStatus,
        message: alertMessage,
        url: url
      }]
    })
  }

  registerIdentity(event) {
    if (this.state.registrationLock) {
      return
    }

    this.setState({ registrationLock: true })

    const username = this.state.username

    if (username.length === 0) {
      this.updateAlert('danger', 'Name must have at least one character')
      return
    }

    const tld = this.state.tlds[this.state.type],
    domainName = username + '.' + tld

    const nameHasBeenPreordered = hasNameBeenPreordered(domainName, this.props.localIdentities)

    if (nameHasBeenPreordered) {
      this.updateAlert('danger', 'Name has already been preordered')
      this.setState({ registrationLock: false })
    } else {
      const address = this.props.identityAddresses[0]
      const keypair = this.props.identityKeypairs[0]

      this.props.registerName(this.props.api, domainName, address, keypair)
      this.updateAlert('success', 'Name preordered! Waiting for registration confirmation.')
      this.setState({ registrationLock: false })
    }

    const analyticsId = this.props.analyticsId
    mixpanel.track('Register identity', { distinct_id: analyticsId })
    mixpanel.track('Perform action', { distinct_id: analyticsId })
  }

  render() {
    let tld = this.state.tlds[this.state.type],
        nameLabel = this.state.nameLabels[this.state.type]
    return (
      <div>
        <div className="container vertical-split-content">
          <div className="col-sm-3">
          </div>
          <div className="col-sm-6">
            { this.state.alerts.map(function(alert, index) {
              return (
                <Alert key={index} message={alert.message} status={alert.status} url={alert.url} />
              )
            })}
            <fieldset className="form-group">
              <label className="capitalize">{nameLabel}</label>
              <div className="input-group">
                <input
                  name="username"
                  className="form-control"
                  placeholder={nameLabel}
                  value={this.state.username}
                  onChange={this.onChange}
                  disabled={this.state.zeroBalance}/>
                <span className="input-group-addon">.{tld}</span>
              </div>
            </fieldset>
            <div>
              <button className="btn btn-blue" onClick={this.registerIdentity}
              disabled={this.props.registration.preventRegistration || this.state.zeroBalance}>
                Register
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(RegisterPage)

/*
          <div>
            <label>Registration Cost</label>
            <div className="highlight">
              <pre>
                <code>
                  {this.state.nameCost} mBTC
                </code>
              </pre>
            </div>
          </div>

<fieldset className="form-group">
  <select name="type" className="c-select"
    defaultValue={this.state.type} onChange={this.onChange}>
    <option value="person">Person</option>
    <option value="organization">Organization</option>
  </select>
</fieldset>
*/
